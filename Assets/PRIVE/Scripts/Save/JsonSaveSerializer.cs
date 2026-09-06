using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Prive.Save
{
    /// <summary>
    /// Serializes a <see cref="SaveNode"/> tree to JSON and back.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Hand-written rather than delegating to a JSON library, for three reasons that matter
    /// on a mobile title: no third-party dependency in the save path, no reflection or IL
    /// generation at load time, and exact <see cref="long"/> round-tripping for money.
    /// </para>
    /// <para>
    /// The scope is deliberately narrow — it only has to read what it writes, plus be
    /// tolerant of hand-edited files. It is not a general-purpose JSON library.
    /// </para>
    /// </remarks>
    public sealed class JsonSaveSerializer : ISaveSerializer
    {
        private readonly bool _pretty;

        public JsonSaveSerializer(bool pretty = false)
        {
            _pretty = pretty;
        }

        public string Serialize(SaveNode root)
        {
            if (root == null) throw new ArgumentNullException("root");

            StringBuilder sb = new StringBuilder(1024);
            Write(sb, root, 0);
            return sb.ToString();
        }

        public SaveNode Deserialize(string text)
        {
            if (string.IsNullOrEmpty(text)) throw new SaveFormatException("Save payload is empty.");

            int index = 0;
            SaveNode node = ParseValue(text, ref index);
            SkipWhitespace(text, ref index);

            if (index != text.Length)
            {
                throw new SaveFormatException("Unexpected trailing content at index " + index + ".");
            }

            return node;
        }

        // --- Writing ------------------------------------------------------------

        private void Write(StringBuilder sb, SaveNode node, int depth)
        {
            switch (node.Type)
            {
                case SaveNodeType.Null:
                    sb.Append("null");
                    break;

                case SaveNodeType.Bool:
                    sb.Append(node.AsBool() ? "true" : "false");
                    break;

                case SaveNodeType.Integer:
                    sb.Append(node.AsLong().ToString(CultureInfo.InvariantCulture));
                    break;

                case SaveNodeType.Float:
                    WriteFloat(sb, node.AsDouble());
                    break;

                case SaveNodeType.String:
                    WriteString(sb, node.AsString(string.Empty));
                    break;

                case SaveNodeType.Object:
                    WriteObject(sb, node, depth);
                    break;

                case SaveNodeType.Array:
                    WriteArray(sb, node, depth);
                    break;
            }
        }

        private void WriteObject(StringBuilder sb, SaveNode node, int depth)
        {
            sb.Append('{');
            bool first = true;

            foreach (string key in node.Keys)
            {
                if (!first) sb.Append(',');
                first = false;
                NewLineIndent(sb, depth + 1);
                WriteString(sb, key);
                sb.Append(':');
                if (_pretty) sb.Append(' ');
                Write(sb, node.GetNode(key), depth + 1);
            }

            if (!first) NewLineIndent(sb, depth);
            sb.Append('}');
        }

        private void WriteArray(StringBuilder sb, SaveNode node, int depth)
        {
            sb.Append('[');
            IReadOnlyList<SaveNode> items = node.Items;

            for (int i = 0; i < items.Count; i++)
            {
                if (i > 0) sb.Append(',');
                NewLineIndent(sb, depth + 1);
                Write(sb, items[i], depth + 1);
            }

            if (items.Count > 0) NewLineIndent(sb, depth);
            sb.Append(']');
        }

        private void NewLineIndent(StringBuilder sb, int depth)
        {
            if (!_pretty) return;
            sb.Append('\n');
            sb.Append(' ', depth * 2);
        }

        private static void WriteFloat(StringBuilder sb, double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
            {
                throw new SaveFormatException("Cannot serialize a non-finite number.");
            }

            // "R" round-trips exactly; force a marker so the parser restores a float node
            // rather than an integer one.
            string text = value.ToString("R", CultureInfo.InvariantCulture);
            sb.Append(text);
            if (text.IndexOf('.') < 0 && text.IndexOf('E') < 0 && text.IndexOf('e') < 0)
            {
                sb.Append(".0");
            }
        }

        private static void WriteString(StringBuilder sb, string value)
        {
            sb.Append('"');

            for (int i = 0; i < value.Length; i++)
            {
                char c = value[i];
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ')
                        {
                            sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }

            sb.Append('"');
        }

        // --- Parsing ------------------------------------------------------------

        private static SaveNode ParseValue(string s, ref int i)
        {
            SkipWhitespace(s, ref i);
            if (i >= s.Length) throw new SaveFormatException("Unexpected end of save payload.");

            char c = s[i];
            switch (c)
            {
                case '{': return ParseObject(s, ref i);
                case '[': return ParseArray(s, ref i);
                case '"': return SaveNode.From(ParseString(s, ref i));
                case 't': Expect(s, ref i, "true"); return SaveNode.From(true);
                case 'f': Expect(s, ref i, "false"); return SaveNode.From(false);
                case 'n': Expect(s, ref i, "null"); return SaveNode.Null();
                default: return ParseNumber(s, ref i);
            }
        }

        private static SaveNode ParseObject(string s, ref int i)
        {
            SaveNode node = SaveNode.NewObject();
            i++; // '{'
            SkipWhitespace(s, ref i);

            if (i < s.Length && s[i] == '}') { i++; return node; }

            while (true)
            {
                SkipWhitespace(s, ref i);
                if (i >= s.Length || s[i] != '"') throw new SaveFormatException("Expected a member name at index " + i + ".");

                string key = ParseString(s, ref i);
                SkipWhitespace(s, ref i);

                if (i >= s.Length || s[i] != ':') throw new SaveFormatException("Expected ':' after member name at index " + i + ".");
                i++;

                node.Set(key, ParseValue(s, ref i));
                SkipWhitespace(s, ref i);

                if (i >= s.Length) throw new SaveFormatException("Unterminated object.");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; return node; }

                throw new SaveFormatException("Expected ',' or '}' at index " + i + ".");
            }
        }

        private static SaveNode ParseArray(string s, ref int i)
        {
            SaveNode node = SaveNode.NewArray();
            i++; // '['
            SkipWhitespace(s, ref i);

            if (i < s.Length && s[i] == ']') { i++; return node; }

            while (true)
            {
                node.Add(ParseValue(s, ref i));
                SkipWhitespace(s, ref i);

                if (i >= s.Length) throw new SaveFormatException("Unterminated array.");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == ']') { i++; return node; }

                throw new SaveFormatException("Expected ',' or ']' at index " + i + ".");
            }
        }

        private static string ParseString(string s, ref int i)
        {
            i++; // opening quote
            StringBuilder sb = new StringBuilder();

            while (true)
            {
                if (i >= s.Length) throw new SaveFormatException("Unterminated string.");

                char c = s[i++];
                if (c == '"') return sb.ToString();

                if (c != '\\')
                {
                    sb.Append(c);
                    continue;
                }

                if (i >= s.Length) throw new SaveFormatException("Unterminated escape sequence.");

                char esc = s[i++];
                switch (esc)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 > s.Length) throw new SaveFormatException("Truncated \\u escape.");
                        sb.Append((char)ushort.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default:
                        throw new SaveFormatException("Unsupported escape '\\" + esc + "' at index " + (i - 1) + ".");
                }
            }
        }

        private static SaveNode ParseNumber(string s, ref int i)
        {
            int start = i;
            bool isFloat = false;

            if (i < s.Length && (s[i] == '-' || s[i] == '+')) i++;

            while (i < s.Length)
            {
                char c = s[i];
                if (c >= '0' && c <= '9') { i++; continue; }
                if (c == '.' || c == 'e' || c == 'E') { isFloat = true; i++; continue; }
                if ((c == '-' || c == '+') && (s[i - 1] == 'e' || s[i - 1] == 'E')) { i++; continue; }
                break;
            }

            if (i == start) throw new SaveFormatException("Expected a number at index " + start + ".");

            string text = s.Substring(start, i - start);

            if (!isFloat)
            {
                long integer;
                if (long.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out integer))
                {
                    return SaveNode.From(integer);
                }
            }

            double value;
            if (!double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out value))
            {
                throw new SaveFormatException("Malformed number '" + text + "' at index " + start + ".");
            }

            return SaveNode.From(value);
        }

        private static void Expect(string s, ref int i, string literal)
        {
            if (i + literal.Length > s.Length || string.CompareOrdinal(s, i, literal, 0, literal.Length) != 0)
            {
                throw new SaveFormatException("Expected '" + literal + "' at index " + i + ".");
            }
            i += literal.Length;
        }

        private static void SkipWhitespace(string s, ref int i)
        {
            while (i < s.Length)
            {
                char c = s[i];
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }
    }
}
