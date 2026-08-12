// Generic Invoice Reader API — C#/.NET example
//
// Uses only the .NET standard library: HttpClient, MultipartFormDataContent,
// StreamContent, AuthenticationHeaderValue, System.Text.Json. No third-party
// NuGet package is required.
//
// baseUrl, token, and filePath are external configuration, supplied by the
// caller (e.g. environment variables, app settings, or a secret store) —
// never hard-code the token.
//
// This file is a template, not coupled to any internal ARTI form or data
// structure: adapt AnalyzeDocumentResponse below to only the fields you
// actually need, or just walk the JsonDocument directly.

using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

// ---- External configuration — replace with your own config mechanism ----
string baseUrl = Environment.GetEnvironmentVariable("INVOICE_API_BASE_URL")
    ?? throw new InvalidOperationException("INVOICE_API_BASE_URL is not set.");
string token = Environment.GetEnvironmentVariable("INVOICE_API_TOKEN")
    ?? throw new InvalidOperationException("INVOICE_API_TOKEN is not set.");
string filePath = Environment.GetEnvironmentVariable("INVOICE_TEST_FILE")
    ?? throw new InvalidOperationException("INVOICE_TEST_FILE is not set.");
// ---------------------------------------------------------------------------

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

using var form = new MultipartFormDataContent();
await using var fileStream = File.OpenRead(filePath);
using var fileContent = new StreamContent(fileStream);
form.Add(fileContent, "file", Path.GetFileName(filePath));

var response = await client.PostAsync($"{baseUrl}/api/v1/documents/analyze", form);

// Present on every response, success or error — keep this for support
// requests instead of sharing the document itself.
string? requestId = response.Headers.TryGetValues("X-Request-ID", out var ids)
    ? ids.FirstOrDefault()
    : null;

string json = await response.Content.ReadAsStringAsync();

if (!response.IsSuccessStatusCode)
{
    // Stable error envelope: { success, error: { code, message }, request_id }.
    using var errorDoc = JsonDocument.Parse(json);
    string? errorCode = errorDoc.RootElement.GetProperty("error").GetProperty("code").GetString();

    // Branch on errorCode (e.g. "UNAUTHORIZED", "PROVIDER_TIMEOUT"), never on the message text.
    Console.WriteLine($"Analyze failed: {response.StatusCode} / {errorCode} (request_id={requestId})");

    if (response.StatusCode == HttpStatusCode.TooManyRequests
        && response.Headers.RetryAfter?.Delta is { } delay)
    {
        // Honor Retry-After before a single bounded retry.
        Console.WriteLine($"Retry after: {delay.TotalSeconds}s");
    }

    return;
}

// Deserialize with System.Text.Json. Only the fields this example reads are
// modeled below — extend as needed, or use JsonDocument directly instead.
var result = JsonSerializer.Deserialize<AnalyzeDocumentResponse>(json)
    ?? throw new InvalidOperationException("Empty response body.");

Console.WriteLine($"success: {result.Success}");
Console.WriteLine($"api_version: {result.ApiVersion}");
Console.WriteLine($"document_type: {result.Document.DocumentType}");
Console.WriteLine($"request_id: {result.RequestId} (matches X-Request-ID: {result.RequestId == requestId})");

// ---- Minimal response model (extend with the fields you need) ----

public class AnalyzeDocumentResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("filename")]
    public string? Filename { get; set; }

    [JsonPropertyName("api_version")]
    public string? ApiVersion { get; set; }

    [JsonPropertyName("request_id")]
    public string? RequestId { get; set; }

    [JsonPropertyName("document")]
    public ProcessedDocument Document { get; set; } = new();
}

public class ProcessedDocument
{
    [JsonPropertyName("document_type")]
    public string? DocumentType { get; set; }

    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }

    // Full schema (invoice, lines, totals, tax_breakdown, payment,
    // fiscal_regime, etc.): see the OpenAPI schema / Swagger UI linked in
    // README-ARTI.md for the authoritative, field-by-field reference.
}
