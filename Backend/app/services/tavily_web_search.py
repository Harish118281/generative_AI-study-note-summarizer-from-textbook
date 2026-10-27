import requests

from app.core.config import settings


TAVILY_SEARCH_URL = "https://api.tavily.com/search"
TAVILY_TIMEOUT_SECONDS = 20
TAVILY_MAX_RESULTS = 5


class TavilySearchError(RuntimeError):
    pass


def search_web(
    query: str,
    search_depth: str = "basic",
    include_images: bool = False,
) -> str | None:
    if not settings.TAVILY_API_KEY:
        return None

    cleaned_query = query.strip()

    if not cleaned_query:
        return None

    if search_depth not in {"basic", "advanced"}:
        search_depth = "basic"

    try:
        response = requests.post(
            TAVILY_SEARCH_URL,
            headers={
                "Authorization": f"Bearer {settings.TAVILY_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "query": cleaned_query,
                "search_depth": search_depth,
                "max_results": TAVILY_MAX_RESULTS,
                "include_answer": True,
                "include_raw_content": False,
                "include_images": include_images,
                "include_image_descriptions": include_images,
            },
            timeout=TAVILY_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        raise TavilySearchError(
            f"Tavily web search failed: {error}"
        ) from error

    data = response.json()

    return _format_tavily_results(data, include_images=include_images)


def search_web_for_nvidia(
    query: str,
    search_depth: str = "basic",
    include_images: bool = False,
) -> str | None:
    return search_web(
        query,
        search_depth=search_depth,
        include_images=include_images,
    )


def _format_tavily_results(
    data: dict,
    include_images: bool = False,
) -> str | None:
    lines: list[str] = [
        "Use the following current web information only when it is relevant.",
        "If the web results do not answer the user's question, say so clearly.",
        "Cite factual claims with Markdown links to the provided source URLs. Do not invent sources.",
        "",
    ]

    answer = data.get("answer")

    if isinstance(answer, str) and answer.strip():
        lines.extend(
            [
                "Tavily answer:",
                answer.strip(),
                "",
            ]
        )

    results = data.get("results", [])

    if not isinstance(results, list):
        results = []

    if results:
        lines.append("Sources:")

    image_items: list[dict[str, str]] = []

    for index, result in enumerate(results, start=1):
        if not isinstance(result, dict):
            continue

        title = str(result.get("title") or "Untitled").strip()
        url = str(result.get("url") or "").strip()
        content = str(result.get("content") or "").strip()

        lines.append(f"{index}. {title}")

        if url:
            lines.append(f"   URL: {url}")

        if content:
            lines.append(f"   Snippet: {content}")

        if include_images:
            result_images = result.get("images", [])
            if isinstance(result_images, list):
                for image in result_images:
                    if isinstance(image, str):
                        image_items.append({"url": image, "source": url, "description": title})
                    elif isinstance(image, dict):
                        image_items.append({
                            "url": str(image.get("url") or ""),
                            "source": str(image.get("source_url") or image.get("source") or url),
                            "description": str(image.get("description") or title),
                        })

        lines.append("")

    top_level_images = data.get("images", [])
    if include_images and isinstance(top_level_images, list):
        for image in top_level_images:
            if isinstance(image, str):
                image_items.append({"url": image, "source": "", "description": "Related image"})
            elif isinstance(image, dict):
                image_items.append({
                    "url": str(image.get("url") or ""),
                    "source": str(image.get("source_url") or image.get("source") or ""),
                    "description": str(image.get("description") or "Related image"),
                })

    if image_items:
        lines.extend([
            "Visual results (use only when images materially help explain the answer).",
            "Render these as a compact Markdown image row, with each image linked to its source page:",
        ])
        seen_urls: set[str] = set()
        gallery: list[str] = []
        for image in image_items:
            image_url = image["url"].strip()
            source_url = image["source"].strip()
            if not image_url.startswith("https://") or image_url in seen_urls:
                continue
            seen_urls.add(image_url)
            description = image["description"].strip().replace("]", "") or "Related image"
            markdown_image = f"![{description}]({image_url})"
            if source_url.startswith("https://"):
                markdown_image = f"[{markdown_image}]({source_url})"
            gallery.append(markdown_image)
            if len(seen_urls) >= 3:
                break
        if gallery:
            lines.append(" ".join(gallery))

    formatted = "\n".join(lines).strip()
    return formatted or None
