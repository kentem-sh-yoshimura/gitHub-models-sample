import ModelClient, {
  ChatRequestAssistantMessage,
  ChatRequestUserMessage,
} from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { createSseStream } from "@azure/core-sse";
import { useState } from "react";
import { useForm } from "react-hook-form";
import ReactMarkdown from "react-markdown";
import "./App.css";

type Inputs = {
  userMessage?: string;
  imageFiles?: FileList;
};

const AOAI_ENDPOINT = import.meta.env["VITE_AOAI_ENDPOINT"];
const AOAI_APIKEY = import.meta.env["VITE_AOAI_APIKEY"];
const MODEL_NAME = "gpt-4o-mini";

const ASSISTANT_ICON = "🥷";
const USER_ICON = "🥺";
const SYSTEM_MESSAGE = "あなたは忍者風の口調で喋るチャットボットです。";
const FIRST_ASSISTANT_MESSAGE = "よくきたな！ゆっくりしていくとよいぞ！";

const App = () => {
  const [messages, setMessages] = useState<
    Array<ChatRequestAssistantMessage | ChatRequestUserMessage>
  >([]);
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
    const imageUrl = await ((): Promise<string | undefined> => {
      const { imageFiles } = data;
      const imageFile = imageFiles && imageFiles[0];
      if (!imageFile) return Promise.resolve(undefined);
      return new Promise<string | undefined>((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = () =>
          resolve(
            typeof reader.result === "string" ? reader.result : undefined
          );
      });
    })();

    const userMessage: ChatRequestUserMessage = {
      role: "user",
      content: (() => {
        if (data.userMessage && imageUrl) {
          return [
            {
              type: "text",
              text: data.userMessage,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ];
        }
        if (imageUrl) {
          return [
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ];
        }
        return data.userMessage ?? "";
      })(),
    };

    setMessages((prev) => [...prev, userMessage]);

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
            userMessage,
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
        {messages.map((message, messageIndex) => (
          <div
            key={messageIndex}
            className={`message ${
              message.role === "assistant"
                ? "assistant-message"
                : "user-message"
            }`}
            ref={
              messages.length - 1 === messageIndex && !streamMessage
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
              {message.role === "assistant" ? ASSISTANT_ICON : USER_ICON}
            </span>
            <div className="v-flex">
              {(() => {
                if (message.role === "assistant")
                  return (
                    <ReactMarkdown className="react-markdown">
                      {message.content}
                    </ReactMarkdown>
                  );

                if (typeof message.content === "string")
                  return (
                    <ReactMarkdown className="react-markdown">
                      {message.content?.replace(/\n/g, "  \n")}
                    </ReactMarkdown>
                  );

                return message.content.map((content, contentIndex) => {
                  if ("image_url" in content)
                    return (
                      <img
                        key={contentIndex}
                        src={content.image_url.url}
                        alt="user uploaded"
                      />
                    );
                  if ("text" in content)
                    return (
                      <ReactMarkdown
                        key={contentIndex}
                        className="react-markdown"
                      >
                        {content.text.replace(/\n/g, "  \n")}
                      </ReactMarkdown>
                    );
                });
              })()}
            </div>
          </div>
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
        <div className="v-flex">
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
                  const { selectionStart, selectionEnd, value } =
                    e.currentTarget;
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
          <input
            type="file"
            accept="image/png, image/jpeg"
            {...register("imageFiles")}
          />
        </div>
        <div className="v-flex">
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
