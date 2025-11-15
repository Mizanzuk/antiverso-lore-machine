
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("OPENAI_API_KEY não configurada.");
}

export const openai = apiKey ? new OpenAI({ apiKey }) : null;
