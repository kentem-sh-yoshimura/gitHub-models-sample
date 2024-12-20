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

const ASSISTANT_ICON = "🥷";
const USER_ICON = "🥺";
const SYSTEM_MESSAGE = "あなたは忍者風の口調で喋るチャットボットです。";
const FIRST_ASSISTANT_MESSAGE = "よくきたな！ゆっくりしていくとよいぞ！";

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
              content: SYSTEM_MESSAGE,
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
          <span className="message first-assistant-message">
            <span className="face-icon">{ASSISTANT_ICON}</span>
            {FIRST_ASSISTANT_MESSAGE}
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
              {x.role === "assistant" ? ASSISTANT_ICON : USER_ICON}
            </span>
            <ReactMarkdown className="react-markdown">
              {x.content.replace(/\n/g, "  \n")}
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
            <span className="face-icon">{ASSISTANT_ICON}</span>
            <ReactMarkdown className="react-markdown">
              {streamMessage}
            </ReactMarkdown>
          </span>
        )}
      </div>
      <form className="chat-form" onSubmit={handleSubmit(callAOAI)}>
        <span className="face-icon">{USER_ICON}</span>
        {(() => {
          const { ref, ...rest } = register("userMessage");
          return (
            <textarea
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;

                if (!e.altKey) {
                  handleSubmit(callAOAI)();
                  return;
                }

                e.preventDefault();
                const { selectionStart, selectionEnd, value } = e.currentTarget;
                e.currentTarget.value =
                  value.slice(0, selectionStart) +
                  "\n" +
                  value.slice(selectionEnd);
                e.currentTarget.selectionStart = selectionStart + 1;
                e.currentTarget.selectionEnd = selectionStart + 1;
              }}
              {...rest}
              disabled={isSubmitting}
              ref={(e) => {
                if (!isSubmitting) e?.focus();
                ref(e);
              }}
            />
          );
        })()}
        <div className="button-area">
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
        </div>
      </form>
    </main>
  );
};

export default App;
