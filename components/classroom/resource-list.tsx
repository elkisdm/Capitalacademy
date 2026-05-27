import {
  FileText,
  ExternalLink,
  FileSpreadsheet,
  File,
  Download,
} from "lucide-react";
import type { LessonResource } from "@/lib/classroom/types";

const TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  link: ExternalLink,
  template: FileSpreadsheet,
  document: File,
  other: File,
};

type ResourceListProps = {
  resources: LessonResource[];
};

export function ResourceList({ resources }: ResourceListProps) {
  if (resources.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">Recursos</h3>
      <ul className="space-y-1">
        {resources.map((resource) => {
          const Icon = TYPE_ICONS[resource.type] ?? File;
          const isExternal = resource.type === "link";

          return (
            <li key={resource.id}>
              <a
                href={resource.url}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                download={!isExternal || undefined}
                className="flex items-center gap-3 rounded-md p-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {resource.title}
                </span>
                {!isExternal && (
                  <Download className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
