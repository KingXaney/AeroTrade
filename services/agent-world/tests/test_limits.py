import pytest

from agent_world.limits import classify, scrub


def _google_error(code: int, status: str, message: str) -> Exception:
    """The error langchain-google-genai raises, chained to the SDK's own as it does."""
    from google.genai.errors import ClientError, ServerError
    from langchain_google_genai.chat_models import ChatGoogleGenerativeAIError

    sdk_class = ClientError if code < 500 else ServerError
    sdk = sdk_class(code, {"error": {"code": code, "status": status, "message": message}})
    try:
        try:
            raise sdk
        except Exception as inner:
            raise ChatGoogleGenerativeAIError(f"Error calling model 'gemini-2.5-flash' ({status}): {inner}") from inner
    except ChatGoogleGenerativeAIError as outer:
        return outer


@pytest.mark.parametrize(("code", "status", "message", "expected"), [
    (429, "RESOURCE_EXHAUSTED", "You exceeded your current quota", 429),
    (403, "PERMISSION_DENIED", "Your API key was reported as leaked", 403),
    (400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", 401),
    (503, "UNAVAILABLE", "The model is overloaded. Please try again later.", 503),
])
def test_gemini_refusals_are_fatal(code, status, message, expected):
    signal = classify(_google_error(code, status, message))
    assert signal is not None
    assert signal.provider == "gemini" and signal.fatal and signal.status == expected


def test_a_plain_model_error_is_not_a_limit():
    assert classify(_google_error(400, "INVALID_ARGUMENT", "Request contains an invalid argument.")) is None


def test_anthropic_refusals_are_fatal():
    import anthropic
    import httpx

    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    for cls, status in ((anthropic.RateLimitError, 429), (anthropic.AuthenticationError, 401)):
        response = httpx.Response(status, request=request, json={"error": {"type": "x", "message": "no"}})
        signal = classify(cls("refused", response=response, body=None))
        assert signal is not None and signal.provider == "anthropic" and signal.status == status and signal.fatal
    response = httpx.Response(529, request=request, json={"type": "error", "error": {"type": "overloaded_error"}})
    signal = classify(anthropic.APIStatusError("Overloaded", response=response, body=None))
    assert signal is not None and signal.status == 529 and signal.fatal


def test_langchain_model_errors_take_the_configured_provider():
    from langchain_core.exceptions import ModelRateLimitError

    signal = classify(ModelRateLimitError("rate limited"), model_hint="google")
    assert signal is not None and signal.provider == "gemini" and signal.status == 429 and signal.fatal


def test_yahoo_rate_limits_are_vendor_notes():
    from tradingagents.dataflows.errors import VendorUnavailableError

    signal = classify(VendorUnavailableError("Yahoo Finance rate limited after 3 retries: YFRateLimitError"), source="yfinance")
    assert signal is not None and (signal.provider, signal.status, signal.fatal) == ("openbb-yfinance", 429, False)
    signal = classify("OpenBB equity.price.historical rate limited (429): Too Many Requests", source="openbb-yfinance")
    assert signal is not None and signal.provider == "openbb-yfinance" and not signal.fatal


def test_sec_and_fred():
    from tradingagents.dataflows.errors import VendorUnavailableError
    from tradingagents.dataflows.vendors.fred import FredNotConfiguredError

    signal = classify(VendorUnavailableError("SEC EDGAR request failed (403)"), source="sec_edgar")
    assert signal is not None and (signal.provider, signal.status, signal.fatal) == ("sec", 403, False)
    signal = classify(VendorUnavailableError("SEC EDGAR request failed (429)"), source="sec_edgar")
    assert signal is not None and signal.status == 429
    signal = classify(FredNotConfiguredError("FRED_API_KEY environment variable is not set."), source="fred")
    assert signal is not None and (signal.provider, signal.status, signal.fatal) == ("fred", 401, False)
    signal = classify("OpenBBError: Missing credential 'fred_api_key'.", source="fred")
    assert signal is not None and signal.provider == "fred"


def test_ordinary_failures_are_not_limits():
    from tradingagents.dataflows.errors import NoMarketDataError, VendorUnavailableError

    assert classify(NoMarketDataError("ZZZZ", "ZZZZ", "no rows")) is None
    assert classify(VendorUnavailableError("Yahoo Finance request failed: ConnectError"), source="yfinance") is None
    assert classify(ValueError("bad indicator")) is None
    assert classify(None) is None


def test_scrub_hides_keys_and_cuts():
    text = scrub("GET https://api.stlouisfed.org/fred/series?series_id=CPI&api_key=abc123&file_type=json failed " + "x" * 400)
    assert "abc123" not in text and "api_key=***" in text
    assert len(text) <= 300
