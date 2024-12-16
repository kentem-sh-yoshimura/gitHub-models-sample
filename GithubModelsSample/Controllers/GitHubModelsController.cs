using Azure.AI.Inference;
using Azure;
using Microsoft.AspNetCore.Mvc;

namespace GithubModelsSample.Controllers;

[ApiController]
[Route("[controller]")]
public class GitHubModelsController : ControllerBase
{
    [HttpPost(Name = "CallGitHubModels")]
    public GitHubModelsRes Post(GitHubModelsReq req)
    {
        // 設定ファイルロード
        var configuration = new ConfigurationBuilder().AddJsonFile("appsettings.json").Build();

        // 設定ファイルから値を取得
        var endpoint = configuration["EndPoint"]
                        ?? throw new Exception("EndPointが設定されていません。");
        var apiKey = configuration["ApiKey"]
                        ?? throw new Exception("ApiKeyが設定されていません。");

        // パラメータチェック
        if (req.UserMessage == null && req.Image == null)
            throw new BadHttpRequestException("UserMessageかImage、どちらかは入力してください。");

        // クライアント作成
        var client = new ChatCompletionsClient(
                new Uri(endpoint),
                new AzureKeyCredential(apiKey),
                new AzureAIInferenceClientOptions()
            );

        // ユーザーコンテンツを設定
        List<ChatMessageContentItem> userContent = [];

        if (req.UserMessage != null)
            userContent.Add(new ChatMessageTextContentItem(req.UserMessage));

        if (req.Image != null)
        {
            using var memoryStream = new MemoryStream();
            req.Image.CopyTo(memoryStream);
            byte[] fileBytes = memoryStream.ToArray();
            userContent.Add(new ChatMessageImageContentItem(
                    BinaryData.FromBytes(fileBytes),
                    req.Image.ContentType
                ));
        }

        // リクエスト作成
        var requestOptions = new ChatCompletionsOptions()
        {
            Model = req.Model,
            Messages = {
                new ChatRequestSystemMessage(req.SystemMessage),
                new ChatRequestUserMessage(userContent),
            },
        };

        // チャット送信
        Response<ChatCompletions> response = client.Complete(requestOptions);

        // レスポンス
        return new GitHubModelsRes
        {
            Model = response.Value.Model,
            PromptTokens = response.Value.Usage.PromptTokens,
            CompletionTokens = response.Value.Usage.CompletionTokens,
            Message = response.Value.Content,
        };
    }

    public class GitHubModelsReq
    {
        public required string Model { get; set; } // 使いたいモデル名
        public required string SystemMessage { get; set; } // システムプロンプト
        public string? UserMessage { get; set; } // ユーザープロンプト
        public IFormFile? Image { get; set; } // 画像
    }

    public class GitHubModelsRes
    {
        public required string Model { get; set; } // 使われたモデル名
        public required int PromptTokens { get; set; } // 入力トークン数
        public required int CompletionTokens { get; set; } // 出力トークン数
        public required string Message { get; set; } // AIの返答
    }
}
