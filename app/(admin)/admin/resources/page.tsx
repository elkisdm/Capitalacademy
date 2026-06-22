import { redirect } from "next/navigation";

// La gestión de recursos se consolidó en el editor de Lecciones: las lecciones
// grabadas manejan su material en su detalle, y las clases en vivo lo cargan
// inline desde el mismo editor. Esta ruta se mantiene como redirección para no
// romper enlaces/bookmarks existentes.
export default async function AdminResourcesPage(props: {
  searchParams: Promise<{ program?: string }>;
}) {
  const { program } = await props.searchParams;
  redirect(program ? `/admin/lessons?program=${program}` : "/admin/lessons");
}
