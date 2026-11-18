//! Erro único da camada de dados.
//!
//! O `code` é estável e a UI traduz (`errors.<code>`); `detail` é o fato
//! técnico, sem tradução, para quem for investigar. Nunca devolvemos uma
//! mensagem pronta em português: o idioma é escolha da interface.

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeckError {
    /// Chave de tradução, ex.: `config.parseFailed`.
    pub code: String,
    /// Detalhe técnico: mensagem do serde, caminho do arquivo, valor recusado.
    pub detail: Option<String>,
}

impl DeckError {
    pub fn new(code: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            detail: None,
        }
    }

    pub fn with_detail(code: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            detail: Some(detail.into()),
        }
    }
}

impl std::fmt::Display for DeckError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.detail {
            Some(detail) => write!(formatter, "{} ({detail})", self.code),
            None => write!(formatter, "{}", self.code),
        }
    }
}

impl std::error::Error for DeckError {}

impl From<std::io::Error> for DeckError {
    fn from(error: std::io::Error) -> Self {
        Self::with_detail("config.ioFailed", error.to_string())
    }
}
