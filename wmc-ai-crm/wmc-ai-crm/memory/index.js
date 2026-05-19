/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  WMC AI CRM — Memory Module                                 ║
 * ║                                                              ║
 * ║  Purpose: Persistent and in-process memory management for   ║
 * ║  customer conversation history and AI context.              ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Memory layers:
 *
 *   Layer 1 — In-process (RAM)
 *     chatHistory Map: phone → [{role, content}]
 *     memoryCache Map: phone → GoogleSheets record
 *     Managed by: loops/memoryLoop.js (eviction)
 *
 *   Layer 2 — Google Sheets (persistent, simple)
 *     "Memory" tab: phone, name, category, lastMessage, lastReply, updatedAt
 *     Managed by: sheetsMemory.js
 *
 *   Layer 3 — Vector DB (future, semantic)
 *     Stores conversation embeddings for semantic recall
 *     "You mentioned back pain 3 weeks ago — is it better?"
 *     Options: ChromaDB (local), Pinecone (cloud), Weaviate
 *
 *   Layer 4 — Summarised long-term memory (future)
 *     AI-generated summaries of past conversations
 *     Injected into system prompt as "Patient History"
 *
 * TODO:
 *   - Implement vector store adapter (start with ChromaDB local)
 *   - Add embedding generation via DeepSeek or OpenAI embeddings API
 *   - Add semantic search: findSimilarMemories(phone, query)
 *   - Add auto-summariser when chatHistory > 30 turns
 */

"use strict";

/**
 * Find the most relevant past memories for a given query.
 * (Stub — future semantic search)
 *
 * @param {string} phone
 * @param {string} query
 * @returns {Promise<string[]>}
 */
async function findSimilarMemories(phone, query) {
  // TODO: Embed query → search vector store → return top-k memories
  console.log(`[Memory] ⚠️  findSimilarMemories() stub — phone:${phone}`);
  return [];
}

/**
 * Summarise a long conversation history into a compact context block.
 * (Stub — future AI summariser)
 *
 * @param {{ role: string; content: string }[]} history
 * @returns {Promise<string>}
 */
async function summariseHistory(history) {
  // TODO: Call DeepSeek with summarisation prompt on long history
  console.log(`[Memory] ⚠️  summariseHistory() stub — ${history.length} turns`);
  return "";
}

module.exports = { findSimilarMemories, summariseHistory };
