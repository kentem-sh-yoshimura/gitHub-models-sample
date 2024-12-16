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
        // �ݒ�t�@�C�����[�h
        var configuration = new ConfigurationBuilder().AddJsonFile("appsettings.json").Build();

        // �ݒ�t�@�C������l���擾
        var endpoint = configuration["EndPoint"]
                        ?? throw new Exception("EndPoint���ݒ肳��Ă��܂���B");
        var apiKey = configuration["ApiKey"]
                        ?? throw new Exception("ApiKey���ݒ肳��Ă��܂���B");

        // �p�����[�^�`�F�b�N
        if (req.UserMessage == null && req.Image == null)
            throw new BadHttpRequestException("UserMessage��Image�A�ǂ��炩�͓��͂��Ă��������B");

        // �N���C�A���g�쐬
        var client = new ChatCompletionsClient(
                new Uri(endpoint),
                new AzureKeyCredential(apiKey),
                new AzureAIInferenceClientOptions()
            );

        // ���[�U�[�R���e���c��ݒ�
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

        // ���N�G�X�g�쐬
        var requestOptions = new ChatCompletionsOptions()
        {
            Model = req.Model,
            Messages = {
                new ChatRequestSystemMessage(req.SystemMessage),
                new ChatRequestUserMessage(userContent),
            },
        };

        // �`���b�g���M
        Response<ChatCompletions> response = client.Complete(requestOptions);

        // ���X�|���X
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
        public required string Model { get; set; } // �g���������f����
        public required string SystemMessage { get; set; } // �V�X�e���v�����v�g
        public string? UserMessage { get; set; } // ���[�U�[�v�����v�g
        public IFormFile? Image { get; set; } // �摜
    }

    public class GitHubModelsRes
    {
        public required string Model { get; set; } // �g��ꂽ���f����
        public required int PromptTokens { get; set; } // ���̓g�[�N����
        public required int CompletionTokens { get; set; } // �o�̓g�[�N����
        public required string Message { get; set; } // AI�̕ԓ�
    }
}
