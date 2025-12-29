import argparse
import html
import json
import os
from typing import Dict

BULLET_LEVELS = ["*", "o", "-"]


def _sorted_entries(path: str):
    return sorted(
        os.listdir(path),
        key=lambda x: (not os.path.isdir(os.path.join(path, x)), x.lower()),
    )


def build_html_tree(root_path: str) -> str:
    root_name = os.path.basename(os.path.normpath(root_path))
    html_lines = [
        '<div style="font-family: Segoe UI, Arial, sans-serif; font-size: 13px; color: #111827; '
        'background: #f8fafc; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; line-height: 1.4;">',
        f'<div style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px;">{html.escape(root_name.upper())}</div>',
    ]

    def walk(path: str, depth: int = 1):
        nonlocal html_lines
        try:
            entries = _sorted_entries(path)
        except OSError:
            return
        for entry in entries:
            if entry.lower() == "thumbs.db":
                continue
            full_path = os.path.join(path, entry)
            is_dir = os.path.isdir(full_path)
            entry_escaped = html.escape(entry)
            bullet = BULLET_LEVELS[min(depth - 1, 2)]
            indent = "&nbsp;&nbsp;&nbsp;&nbsp;" * depth
            line_start = f'{indent}<span style="color:#f97316;">{bullet}</span>&nbsp;'
            if is_dir:
                style = (
                    'style="font-weight: 700; text-decoration: underline;"'
                    if depth <= 2
                    else 'style="font-weight: 600;"'
                )
                html_lines.append(f"<div>{line_start}<span {style}>{entry_escaped}:</span></div>")
                walk(full_path, depth + 1)
            else:
                html_lines.append(
                    f'<div>{line_start}<span style="font-style: italic;">{entry_escaped}</span></div>'
                )

    walk(root_path)
    html_lines.append("</div>")
    return "\n".join(html_lines)


def build_text_tree(root_path: str) -> str:
    root_name = os.path.basename(os.path.normpath(root_path))
    lines = [f"{root_name.upper()}:"]

    def walk(path: str, depth: int = 1):
        try:
            entries = _sorted_entries(path)
        except OSError:
            return
        for entry in entries:
            if entry.lower() == "thumbs.db":
                continue
            full_path = os.path.join(path, entry)
            is_dir = os.path.isdir(full_path)
            bullet = BULLET_LEVELS[min(depth - 1, 2)]
            indent = "    " * depth
            if is_dir:
                lines.append(f"{indent}{bullet} {entry}:")
                walk(full_path, depth + 1)
            else:
                lines.append(f"{indent}{bullet} {entry}")

    walk(root_path)
    return "\n".join(lines)


def render_tree(root_path: str) -> Dict[str, str]:
    return {
        "html": build_html_tree(root_path),
        "text": build_text_tree(root_path),
    }


def main():
    parser = argparse.ArgumentParser(description="Générer une arborescence HTML et texte.")
    parser.add_argument("--path", required=True, help="Chemin du dossier à analyser")
    parser.add_argument(
        "--format",
        choices=["json", "html", "text"],
        default="json",
        help="Format de sortie",
    )
    args = parser.parse_args()

    if not os.path.exists(args.path):
        raise SystemExit(f"Chemin introuvable: {args.path}")

    result = render_tree(args.path)

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False))
    elif args.format == "html":
        print(result["html"])
    else:
        print(result["text"])


if __name__ == "__main__":
    main()
