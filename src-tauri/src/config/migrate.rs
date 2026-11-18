//! Migração de schema, um degrau por versão.

use serde_json::{json, Value};

use super::model::{Config, SCHEMA_VERSION};
use crate::error::DeckError;

/// Recebe o JSON cru e devolve uma config na versão atual.
///
/// v0 → v1: arquivos anteriores não tinham `schemaVersion`; campos ausentes são
/// preenchidos pelo `Default` do modelo. Nada é renomeado.
///
/// v1 → v2: teclas deixam de ser um enum fechado (`page_up`) e viram nomes XKB
/// livres (`Page_Up`); `general.actionKeys` some (cada ação carrega a sua
/// tecla); o tempo do overlay que ainda era o antigo padrão (1600 ms) vira 2000.
pub fn migrate(mut value: Value) -> Result<Config, DeckError> {
    let version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or(0);

    if version > u64::from(SCHEMA_VERSION) {
        return Err(DeckError::with_detail(
            "config.schemaNewer",
            format!("arquivo v{version}, este app entende até v{SCHEMA_VERSION}"),
        ));
    }

    // `overlay.clickThrough` deixou de existir (o HUD não cobre mais a tela); o
    // campo antigo é ignorado na leitura.
    if version < 2 {
        upgrade_v1_to_v2(&mut value);
    }

    // Campos ausentes vêm da semente. É o que permite abrir um arquivo de uma
    // versão anterior (ou editado à mão) sem exigir todos os campos.
    let defaults = serde_json::to_value(Config::default())
        .map_err(|error| DeckError::with_detail("config.parseFailed", error.to_string()))?;
    fill_missing(&mut value, &defaults);

    if let Some(object) = value.as_object_mut() {
        object.insert("schemaVersion".to_string(), json!(SCHEMA_VERSION));
    }

    serde_json::from_value(value)
        .map_err(|error| DeckError::with_detail("config.parseFailed", error.to_string()))
}

/// `page_up` → `Page_Up`. Nomes desconhecidos passam como vieram.
fn legacy_key(name: &str) -> String {
    match name {
        "home" => "Home",
        "end" => "End",
        "page_up" => "Page_Up",
        "page_down" => "Page_Down",
        "insert" => "Insert",
        "delete" => "Delete",
        other => return other.to_string(),
    }
    .to_string()
}

fn upgrade_v1_to_v2(value: &mut Value) {
    let Some(root) = value.as_object_mut() else {
        return;
    };

    if let Some(general) = root.get_mut("general").and_then(Value::as_object_mut) {
        if let Some(key) = general.get("modeKey").and_then(Value::as_str) {
            let upgraded = legacy_key(key);
            general.insert("modeKey".to_string(), json!(upgraded));
        }
        general.remove("actionKeys");
        if let Some(overlay) = general.get_mut("overlay").and_then(Value::as_object_mut) {
            if overlay.get("hideAfterMs").and_then(Value::as_u64) == Some(1_600) {
                overlay.insert("hideAfterMs".to_string(), json!(2_000));
            }
        }
    }

    if let Some(modes) = root.get_mut("modes").and_then(Value::as_array_mut) {
        for mode in modes {
            let Some(actions) = mode.get_mut("actions").and_then(Value::as_array_mut) else {
                continue;
            };
            for action in actions {
                if let Some(key) = action.get("key").and_then(Value::as_str) {
                    let upgraded = legacy_key(key);
                    action["key"] = json!(upgraded);
                }
            }
        }
    }
}

/// Preenche recursivamente o que falta no alvo com o valor padrão. Arrays são
/// preservados inteiros: uma lista vazia é escolha do usuário, não buraco.
fn fill_missing(target: &mut Value, defaults: &Value) {
    let (Value::Object(target), Value::Object(defaults)) = (target, defaults) else {
        return;
    };
    for (key, default) in defaults {
        match target.get_mut(key) {
            Some(existing) => fill_missing(existing, default),
            None => {
                target.insert(key.clone(), default.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arquivo_vazio_vira_semente() {
        let config = migrate(json!({})).expect("v0 deve migrar");
        assert_eq!(config.schema_version, SCHEMA_VERSION);
        assert!(!config.modes.is_empty());
        assert!(config.validate().is_ok());
    }

    #[test]
    fn v1_vira_v2_sem_perder_teclas() {
        let config = migrate(json!({
            "schemaVersion": 1,
            "general": {
                "modeKey": "home",
                "actionKeys": ["page_up", "page_down", "end"],
                "overlay": { "enabled": true, "showOnModeChange": true, "hideAfterMs": 1600, "clickThrough": true }
            },
            "modes": [{
                "id": "m", "name": "M", "color": "sky", "layout": "row",
                "actions": [{
                    "id": "a", "label": "Copiar", "key": "page_up",
                    "span": { "cols": 1, "rows": 1 },
                    "payload": { "kind": "shortcut", "combo": "ctrl+c" }
                }]
            }],
            "activeMode": "m"
        }))
        .expect("v1 deve migrar");
        assert_eq!(config.general.mode_key, "Home");
        assert_eq!(config.modes[0].actions[0].key, "Page_Up");
        assert_eq!(config.general.overlay.hide_after_ms, 2_000);
        assert!(config.general.capture_enabled);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn versao_futura_e_recusada() {
        let error = migrate(json!({ "schemaVersion": SCHEMA_VERSION + 1 })).expect_err("deve falhar");
        assert_eq!(error.code, "config.schemaNewer");
    }

    #[test]
    fn json_invalido_diz_onde_falhou() {
        let error = migrate(json!({ "modes": 7 })).expect_err("deve falhar");
        assert_eq!(error.code, "config.parseFailed");
        assert!(error.detail.is_some());
    }
}
