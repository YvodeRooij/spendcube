import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const model = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0.7,
    });

    const parser = new StringOutputParser();

    const messages = [
      new SystemMessage("You are a helpful AI assistant."),
      new HumanMessage(message),
    ];

    const response = await model.pipe(parser).invoke(messages);

    return NextResponse.json({ response });
  } catch (error) {
    console.error("LangChain error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
