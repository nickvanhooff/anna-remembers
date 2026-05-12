import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    content: str


class HistoryEntryProof(BaseModel):
    """One message row included in the LLM history (PostgreSQL)."""

    message_id: uuid.UUID
    role: str
    content_preview: str


class PostgresContextProof(BaseModel):
    """Provenance for session-scoped chat history loaded from PostgreSQL."""

    origin: Literal["postgresql"] = "postgresql"
    database_table: Literal["messages"] = "messages"
    session_id: uuid.UUID
    patient_id: uuid.UUID
    history_query_limit: int
    messages_in_history: int
    history_entries: list[HistoryEntryProof]


class RAGHitProof(BaseModel):
    """Single semantic hit returned by recall_context (Chroma via MCP)."""

    content: str
    source: str
    session_id: str
    distance: float | None = None


class RAGContextProof(BaseModel):
    """Provenance for vector recall — MCP tool recall_context → ChromaDB."""

    origin: Literal["mcp_recall_context"] = "mcp_recall_context"
    query: str
    limit: int
    hit_count: int
    hits: list[RAGHitProof]


class StoreMemoryProof(BaseModel):
    """Provenance for persisting the user utterance into RAG (parallel MCP call)."""

    origin: Literal["mcp_store_memory"] = "mcp_store_memory"
    chroma_document_id: str | None = Field(
        default=None,
        description="ID returned by store_memory for the embedded chunk.",
    )


class CombinedContextProof(BaseModel):
    """How PostgreSQL history and RAG snippets are combined for the LLM."""

    history_messages_sent_to_llm: int
    system_prompt_includes_patient_row: bool = True
    system_prompt_includes_rag_block: bool
    system_prompt_char_length: int


class ChatContextProof(BaseModel):
    """Structured evidence: Postgres vs RAG and how they relate in one request."""

    postgres: PostgresContextProof
    rag: RAGContextProof
    store_memory: StoreMemoryProof
    combined: CombinedContextProof


class MessageResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    created_at: datetime
    context_proof: ChatContextProof | None = Field(
        default=None,
        description="Present when POST /chat/{id}?debug=true — audit trail for Postgres vs RAG.",
    )

    model_config = {"from_attributes": True}
