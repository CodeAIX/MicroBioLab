import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const knowledgeMarkdownSchema = {
  ...defaultSchema,
  tagNames: [...new Set([...(defaultSchema.tagNames ?? []), "details", "summary"])],
};

export default function KnowledgeReview({ content }: { content: string }) {
  return <article className="knowledge-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, knowledgeMarkdownSchema]]}>{content}</ReactMarkdown>
  </article>;
}
