const INLINE_SCRIPT_UNSAFE_CHAR_MAP: Record<string, string> = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const INLINE_SCRIPT_UNSAFE_CHAR_PATTERN = /[<>/\\\b\f\n\r\t\0\u2028\u2029]/g;

function escapeUnsafeInlineScriptChars(value: string): string {
  return value.replace(
    INLINE_SCRIPT_UNSAFE_CHAR_PATTERN,
    (char) => INLINE_SCRIPT_UNSAFE_CHAR_MAP[char] ?? char,
  );
}

/**
 * A value as a JavaScript literal that is safe inside an inline <script>: JSON, with the
 * characters that could close the tag or break the line escaped.
 */
export function safeJsonForInlineScript(value: unknown): string {
  return escapeUnsafeInlineScriptChars(JSON.stringify(value));
}
