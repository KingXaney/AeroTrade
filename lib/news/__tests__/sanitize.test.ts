// Both sanitizers guard the same boundary: model output built from attacker-writable
// text (scraped headlines, user-supplied signup answers) being injected into email HTML.

import {describe, expect, it} from "vitest";

import {sanitizeDigestHtml, sanitizeWelcomeIntroHtml} from "@/lib/news/sanitize";

describe("sanitizeDigestHtml", () => {
    const allowed = ["https://example.test/real-story?utm_source=rss"];

    it("keeps a link that points at an article actually in the set", () => {
        const html = '<a href="https://example.test/real-story">Read Full Story</a>';
        expect(sanitizeDigestHtml(html, allowed)).toBe(html);
    });

    it("collapses an off-allowlist link to its text, keeping the words", () => {
        const html = '<a href="https://evil.test/phish">Read Full Story</a>';
        expect(sanitizeDigestHtml(html, allowed)).toBe("Read Full Story");
    });

    it("removes dangerous containers entirely", () => {
        expect(sanitizeDigestHtml('<p>ok</p><script>steal()</script>', allowed)).toBe("<p>ok</p>");
        expect(sanitizeDigestHtml('<iframe src="https://evil.test"></iframe>hi', allowed)).toBe("hi");
    });

    it("matches allowed URLs after normalization, not byte-for-byte", () => {
        // The allowlist entry carries a utm parameter; the model emitted the clean URL.
        const html = '<a href="https://example.test/real-story/">Story</a>';
        expect(sanitizeDigestHtml(html, allowed)).toContain("<a");
    });
});

describe("sanitizeWelcomeIntroHtml", () => {
    it("keeps the copy and the emphasis the prompt asks for", () => {
        const out = sanitizeWelcomeIntroHtml(
            '<p class="x" style="color:red">Thanks for joining! You follow <strong>energy</strong>.</p>',
        );
        expect(out).toContain("Thanks for joining!");
        expect(out).toContain("<strong>energy</strong>");
    });

    it("rebuilds the wrapper instead of trusting the model's attributes", () => {
        const out = sanitizeWelcomeIntroHtml('<p onclick="steal()" class="evil">Hello</p>');
        expect(out).not.toContain("onclick");
        expect(out).not.toContain("evil");
        expect(out).toContain('class="mobile-text"');
    });

    it("drops script tags and any tag outside the inline allowlist", () => {
        const out = sanitizeWelcomeIntroHtml('<script>steal()</script><div><p>Hi <img src=x onerror=go()>there</p></div>');
        expect(out).not.toContain("script");
        expect(out).not.toContain("onerror");
        expect(out).not.toContain("<div");
        expect(out).toContain("Hi");
        expect(out).toContain("there");
    });

    it("escapes angle brackets that survive tag stripping", () => {
        const out = sanitizeWelcomeIntroHtml('Goals: buy < sell > hold');
        expect(out).toContain("&lt;");
        expect(out).toContain("&gt;");
    });

    // The signup fields are user-supplied, so this is the actual injection path.
    it("neutralises markup smuggled in through a profile field", () => {
        const out = sanitizeWelcomeIntroHtml('<p>Focused on <strong>tech</strong><a href="https://evil.test">claim prize</a></p>');
        expect(out).not.toContain("<a");
        expect(out).not.toContain("evil.test");
        expect(out).toContain("claim prize");
    });

    it("normalises b and i to strong and em", () => {
        const out = sanitizeWelcomeIntroHtml("<b>bold</b> and <i>italic</i>");
        expect(out).toContain("<strong>bold</strong>");
        expect(out).toContain("<em>italic</em>");
    });

    it("wraps plain text so the fallback copy renders identically", () => {
        const out = sanitizeWelcomeIntroHtml("Thanks for joining AlgoTest.");
        expect(out).toBe(
            '<p class="mobile-text" style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #CCDADC;">Thanks for joining AlgoTest.</p>',
        );
    });

    // The restore step turns internal sentinels back into tags, so text that already
    // contains those bytes must not be able to ride through the escaping as markup.
    it("cannot be tricked into emitting a tag via sentinel characters", () => {
        const open = String.fromCharCode(1);
        const close = String.fromCharCode(2);
        const out = sanitizeWelcomeIntroHtml(`${open}script${open}alert(1)${close}script${close}`);
        expect(out).not.toContain("<script>");
        expect(out).toContain("scriptalert(1)script");
    });

    it("returns empty for nothing usable, so the caller can fall back", () => {
        expect(sanitizeWelcomeIntroHtml("")).toBe("");
        expect(sanitizeWelcomeIntroHtml("<script>steal()</script>")).toBe("");
        expect(sanitizeWelcomeIntroHtml("   ")).toBe("");
    });
});
