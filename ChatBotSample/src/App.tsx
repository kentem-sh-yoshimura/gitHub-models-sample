import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { createSseStream } from "@azure/core-sse";
import { useState } from "react";
import { useForm } from "react-hook-form";
import ReactMarkdown from "react-markdown";
import "./App.css";

type Inputs = {
  userMessage: string;
};

type Messages = {
  role: "assistant" | "user";
  content: string;
};

const AOAI_ENDPOINT = import.meta.env["VITE_AOAI_ENDPOINT"];
const AOAI_APIKEY = import.meta.env["VITE_AOAI_APIKEY"];
const MODEL_NAME = "gpt-4o-mini";

const App = () => {
  const [messages, setMessages] = useState<Array<Messages>>([]);
  const [streamMessage, setStreamMessage] = useState<string | undefined>();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<Inputs>();

  const client = ModelClient(
    AOAI_ENDPOINT,
    new AzureKeyCredential(AOAI_APIKEY)
  );

  const callAOAI = async (data: Inputs) => {
    setMessages((prev) => [
      ...prev,
      { role: "user", content: data.userMessage },
    ]);

    const response = await client
      .path("/chat/completions")
      .post({
        body: {
          messages: [
            {
              role: "system",
              content: "あなたは皮肉的な口調で喋るチャットボットです。",
            },
            ...messages,
            { role: "user", content: data.userMessage },
          ],
          temperature: 1.0,
          top_p: 1.0,
          max_tokens: 1000,
          model: MODEL_NAME,
          stream: true,
        },
      })
      .asBrowserStream();

    const stream = response.body;
    if (response.status !== "200" || !stream) {
      setMessages((prev) => {
        return [
          ...prev,
          {
            role: "assistant",
            content: "Error!!",
          },
        ];
      });
      reset();
      return;
    }

    const sseStream = createSseStream(stream);
    for await (const event of sseStream) {
      if (event.data !== "[DONE]") {
        for (const choice of JSON.parse(event.data).choices) {
          if (!choice.delta?.content) continue;
          setStreamMessage((prev) => {
            if (!prev) return choice.delta?.content;

            return `${prev}${choice.delta?.content}`;
          });
        }
      }
    }

    setStreamMessage((prevStreamMessage) => {
      setMessages((prevMessages) => {
        return [
          ...prevMessages,
          {
            role: "assistant",
            content: prevStreamMessage ?? "",
          },
        ];
      });
      return undefined;
    });

    reset();
  };

  return (
    <main>
      <div className="message-area">
        {!messages.length && (
          <span className="message assistant-message">
            <span className="face-icon">🤣</span>
            こんにちは！暇なんですか？お話しますか？
          </span>
        )}
        {messages.map((x, i) => (
          <span
            key={i}
            className={`message ${
              x.role === "assistant" ? "assistant-message" : "user-message"
            }`}
            ref={
              messages.length - 1 === i && !streamMessage
                ? (ref) => {
                    if (!ref) return;
                    ref.scrollIntoView({
                      behavior: "smooth",
                      block: "end",
                    });
                  }
                : undefined
            }
          >
            <span className="face-icon">
              {x.role === "assistant" ? "🤣" : "🥺"}
            </span>
            <ReactMarkdown className="react-markdown">
              {x.content}
            </ReactMarkdown>
          </span>
        ))}
        {streamMessage && (
          <span
            className="message assistant-message"
            ref={(ref) => {
              if (!ref) return;
              ref.scrollIntoView({
                behavior: "smooth",
                block: "end",
              });
            }}
          >
            <span className="face-icon">🤣</span>
            <ReactMarkdown className="react-markdown">
              {streamMessage}
            </ReactMarkdown>
          </span>
        )}
      </div>
      <form className="chat-form" onSubmit={handleSubmit(callAOAI)}>
        <span className="face-icon">🥺</span>
        {(() => {
          const { ref, ...rest } = register("userMessage");
          return (
            <input
              type="text"
              autoComplete="off"
              {...rest}
              disabled={isSubmitting}
              ref={(e) => {
                if (!isSubmitting) e?.focus();
                ref(e);
              }}
            />
          );
        })()}
        <button type="submit" disabled={isSubmitting}>
          送信
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setMessages([]);
            setStreamMessage(undefined);
          }}
          disabled={isSubmitting}
        >
          クリア
        </button>
      </form>
    </main>
  );
};

export default App;
