"""
OPTIONAL BONUS — RAG over precedent programs.

Day 5 used Ollama embeddings, which won't run on a deployed server (no local
Ollama). This version uses ChromaDB's default in-process embedding function so
it works anywhere with no extra services. Enable by setting USE_RAG=true.

If you'd rather skip RAG entirely, leave USE_RAG=false and program_generator
falls back to inlining all precedents (which is perfectly fine for the capstone).
"""

import chromadb
from chromadb.utils import embedding_functions

from precedents import ALL_PRECEDENTS

_COLLECTION_NAME = "precedent_programs"
_client = chromadb.Client()  # in-memory; rebuilt on startup, fine for 3 docs
_embed_fn = embedding_functions.DefaultEmbeddingFunction()
_collection = None


def _ensure_collection():
    global _collection
    if _collection is not None:
        return _collection
    _collection = _client.get_or_create_collection(
        name=_COLLECTION_NAME,
        embedding_function=_embed_fn,
        metadata={"hnsw:space": "cosine"},
    )
    if _collection.count() == 0:
        _collection.add(
            ids=[f"precedent-{i}" for i in range(len(ALL_PRECEDENTS))],
            documents=[p.strip() for p in ALL_PRECEDENTS],
        )
    return _collection


def retrieve_precedents(query: str, top_k: int = 2) -> str:
    col = _ensure_collection()
    n = min(top_k, col.count())
    results = col.query(query_texts=[query], n_results=n)
    docs = results["documents"][0] if results["documents"] else []
    return "\n\n".join(docs)
