//! Leitura e escrita do `config.json`.
//!
//! Três garantias que a UI depende:
//! 1. o arquivo nunca fica meio escrito (tmp + fsync + rename no mesmo dir);
//! 2. um arquivo quebrado não impede o app de abrir (vai para backup e a
//!    semente entra no lugar, com aviso visível);
//! 3. o que sai do disco é validado antes de entrar na memória e antes de ser
//!    salvo.

use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use specta::Type;

use super::migrate::migrate;
use super::model::Config;
use crate::error::DeckError;

const FILE_NAME: &str = "config.json";

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LoadOutcome {
    pub config: Config,
    /// Primeira execução: o arquivo acabou de ser criado.
    pub created: bool,
    /// O arquivo anterior não servia e foi preservado em `backup_path`.
    pub backup_path: Option<String>,
    pub warnings: Vec<DeckError>,
}

#[derive(Debug, Clone)]
pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn discover() -> Self {
        Self {
            path: config_dir().join(FILE_NAME),
        }
    }

    /// Usado pelos testes para escrever num diretório descartável.
    #[cfg(test)]
    pub fn at(dir: impl AsRef<Path>) -> Self {
        Self {
            path: dir.as_ref().join(FILE_NAME),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> Result<LoadOutcome, DeckError> {
        if !self.path.exists() {
            let config = Config::default();
            self.save(&config)?;
            return Ok(LoadOutcome {
                config,
                created: true,
                backup_path: None,
                warnings: Vec::new(),
            });
        }

        let raw = fs::read_to_string(&self.path).map_err(|error| {
            DeckError::with_detail("config.readFailed", format!("{}: {error}", self.path.display()))
        })?;

        let parsed = serde_json::from_str::<serde_json::Value>(&raw)
            .map_err(|error| DeckError::with_detail("config.parseFailed", error.to_string()))
            .and_then(migrate)
            .and_then(|config| {
                config.validate()?;
                Ok(config)
            });

        match parsed {
            Ok(config) => Ok(LoadOutcome {
                config,
                created: false,
                backup_path: None,
                warnings: Vec::new(),
            }),
            Err(error) => {
                // O arquivo do usuário é preservado: o app prefere abrir com a
                // semente a ficar inutilizável, mas nunca apaga o original.
                let backup = self.backup()?;
                let config = Config::default();
                self.save(&config)?;
                let mut warnings = vec![DeckError::with_detail("config.recovered", backup.clone())];
                if error.code != "config.parseFailed" {
                    warnings.push(error);
                }
                Ok(LoadOutcome {
                    config,
                    created: false,
                    backup_path: Some(backup),
                    warnings,
                })
            }
        }
    }

    pub fn save(&self, config: &Config) -> Result<(), DeckError> {
        config.validate()?;

        let parent = self.path.parent().ok_or_else(|| {
            DeckError::with_detail("config.writeFailed", "o caminho não tem diretório")
        })?;
        fs::create_dir_all(parent).map_err(|error| {
            DeckError::with_detail("config.writeFailed", format!("{}: {error}", parent.display()))
        })?;
        let _ = restrict(parent, 0o700);

        let bytes = serde_json::to_vec_pretty(config)
            .map_err(|error| DeckError::with_detail("config.writeFailed", error.to_string()))?;

        let temp = self.path.with_extension("json.tmp");
        {
            let mut file = fs::File::create(&temp).map_err(|error| {
                DeckError::with_detail("config.writeFailed", format!("{}: {error}", temp.display()))
            })?;
            file.write_all(&bytes).map_err(|error| {
                DeckError::with_detail("config.writeFailed", format!("{}: {error}", temp.display()))
            })?;
            file.write_all(b"\n").ok();
            file.sync_all().map_err(|error| {
                DeckError::with_detail("config.writeFailed", format!("fsync: {error}"))
            })?;
        }
        let _ = restrict(&temp, 0o600);

        if self.path.exists() {
            let backup = self.path.with_extension("json.bak");
            let _ = fs::copy(&self.path, &backup);
        }

        fs::rename(&temp, &self.path).map_err(|error| {
            DeckError::with_detail("config.writeFailed", format!("rename: {error}"))
        })?;

        // Sem fsync do diretório, o rename pode se perder num desligamento.
        if let Ok(dir) = fs::File::open(parent) {
            let _ = dir.sync_all();
        }

        Ok(())
    }

    fn backup(&self) -> Result<String, DeckError> {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or_default();
        let stem = self
            .path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("config");
        let backup = self
            .path
            .with_file_name(format!("{stem}.broken-{stamp}.json"));

        fs::rename(&self.path, &backup).map_err(|error| {
            DeckError::with_detail("config.writeFailed", format!("backup: {error}"))
        })?;
        Ok(backup.display().to_string())
    }
}

/// Só o dono lê e escreve (Unix). No Windows o perfil do usuário já é privado.
#[cfg(unix)]
fn restrict(path: &Path, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
}

#[cfg(not(unix))]
fn restrict(_path: &Path, _mode: u32) -> std::io::Result<()> {
    Ok(())
}

/// `$MOONDECK_CONFIG_DIR` existe para testes e para quem quiser portabilidade.
fn config_dir() -> PathBuf {
    if let Some(dir) = env::var_os("MOONDECK_CONFIG_DIR").filter(|value| !value.is_empty()) {
        return PathBuf::from(dir);
    }
    #[cfg(target_os = "windows")]
    if let Some(dir) = env::var_os("APPDATA").filter(|value| !value.is_empty()) {
        return PathBuf::from(dir).join("moondeck");
    }
    #[cfg(target_os = "macos")]
    if let Some(home) = env::var_os("HOME").filter(|value| !value.is_empty()) {
        return PathBuf::from(home).join("Library").join("Application Support").join("moondeck");
    }
    if let Some(dir) = env::var_os("XDG_CONFIG_HOME").filter(|value| !value.is_empty()) {
        return PathBuf::from(dir).join("moondeck");
    }
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir);
    home.join(".config").join("moondeck")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::model::{SeedLocale, seed};

    fn scratch() -> PathBuf {
        let dir = env::temp_dir().join(format!("moondeck-test-{}", crate::config::model::new_id("dir")));
        fs::create_dir_all(&dir).expect("criar diretório de teste");
        dir
    }

    #[test]
    fn primeira_leitura_cria_o_arquivo() {
        let dir = scratch();
        let store = ConfigStore::at(&dir);
        let outcome = store.load().expect("carregar");
        assert!(outcome.created);
        assert!(store.path().exists());

        let raw = fs::read_to_string(store.path()).expect("ler");
        assert!(raw.contains("\"schemaVersion\": 2"));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn ida_e_volta_preserva_os_dados() {
        let dir = scratch();
        let store = ConfigStore::at(&dir);
        let mut config = seed(SeedLocale::PtBr);
        config.modes[0].name = "Camada de teste".to_string();
        store.save(&config).expect("salvar");

        let loaded = store.load().expect("carregar").config;
        assert_eq!(loaded, config);
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn arquivo_quebrado_vai_para_backup() {
        let dir = scratch();
        let store = ConfigStore::at(&dir);
        fs::write(store.path(), "{ isto não é json").expect("escrever lixo");

        let outcome = store.load().expect("deve abrir mesmo assim");
        assert!(outcome.backup_path.is_some(), "backup deveria existir");
        let backup = outcome.backup_path.expect("caminho");
        assert!(Path::new(&backup).exists());
        assert!(outcome.config.validate().is_ok());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn config_invalida_nao_e_salva() {
        let dir = scratch();
        let store = ConfigStore::at(&dir);
        let mut config = seed(SeedLocale::PtBr);
        config.modes[0].name = String::new();
        let error = store.save(&config).expect_err("deve recusar");
        assert_eq!(error.code, "mode.nameEmpty");
        fs::remove_dir_all(dir).ok();
    }
}
