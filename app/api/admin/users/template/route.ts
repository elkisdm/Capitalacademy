import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const ws = XLSX.utils.aoa_to_sheet([
    ["nombre_completo", "email", "telefono", "rut"],
    [
      "Juan Pérez González",
      "juan.perez@ejemplo.cl",
      "+56 9 1234 5678",
      "12.345.678-5",
    ],
    [
      "María González",
      "maria.gonzalez@ejemplo.cl",
      "+56 9 8765 4321",
      "9.876.543-2",
    ],
  ]);

  ws["!cols"] = [{ wch: 28 }, { wch: 30 }, { wch: 20 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Usuarios");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="plantilla-importacion-usuarios.xlsx"',
    },
  });
}
