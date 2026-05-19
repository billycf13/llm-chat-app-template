/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Default system prompt
const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes
		if (url.pathname === "/api/chat") {
			// Handle POST requests for chat
			if (request.method === "POST") {
				return handleChatRequest(request, env);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405 });
		}

		// tambah route di fetch handler, sebelum return Not found
		if (url.pathname === "/api/chat/json" && request.method === "POST") {
		return handleChatJsonRequest(request, env);
		}

		// OpenAI-compatible: fake /v1/models untuk verifikasi n8n
		if (url.pathname === "/v1/models" && request.method === "GET") {
		return Response.json({
			object: "list",
			data: [{ id: MODEL_ID, object: "model", created: 0, owned_by: "cloudflare" }]
		});
		}

		// OpenAI-compatible: /v1/chat/completions untuk n8n
		if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
		const body = (await request.json()) as { messages: ChatMessage[] };
		const messages = body.messages ?? [];
		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}
		const result = (await env.AI.run(MODEL_ID, {
			messages,
			max_tokens: 1024,
			stream: false,
		})) as { response: string };

		return Response.json({
			id: "chatcmpl-cf",
			object: "chat.completion",
			choices: [{
			index: 0,
			message: { role: "assistant", content: result.response },
			finish_reason: "stop"
			}]
		});
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		// Parse JSON request body
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		// Add system prompt if not present
		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		const stream = await env.AI.run(
			MODEL_ID,
			{
				messages,
				max_tokens: 1024,
				stream: true,
			},
			{
				// Uncomment to use AI Gateway
				// gateway: {
				//   id: "YOUR_GATEWAY_ID", // Replace with your AI Gateway ID
				//   skipCache: false,      // Set to true to bypass cache
				//   cacheTtl: 3600,        // Cache time-to-live in seconds
				// },
			},
		);

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
// tambah function ini di bawah handleChatRequest
async function handleChatJsonRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const { messages = [], system } = (await request.json()) as {
      messages: ChatMessage[];
      system?: string;
    };

    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: system ?? SYSTEM_PROMPT });
    }

    const result = (await env.AI.run(MODEL_ID, {
      messages,
      max_tokens: 1024,
      stream: false,
    })) as { response: string };

    return new Response(JSON.stringify({ response: result.response }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(JSON.stringify({ error: "Failed to process request" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}