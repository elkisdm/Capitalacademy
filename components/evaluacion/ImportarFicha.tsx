"use client";

import { useState } from "react";
import { FileInput } from "@/components/ui/file-input";
import {
  ArchivoNoEsEESSError,
  HOJA_EESS,
  importarEESS,
  lectorDeHoja,
  type ImporteEESS,
} from "@/lib/evaluacion/importar-eess";

type Props = {
  valorUF: number;
  onImport: (resultado: ImporteEESS) => void;
};

/**
 * Sube el Excel "EESS - PORTAL CREDITO - CLIENTES" y autopobla la ficha.
 *
 * El archivo se lee COMPLETO en el navegador (arrayBuffer + xlsx): nunca se
 * sube a un servidor, igual que el resto de la ficha (decisión 1 del ADR-0032).
 * El parser de xlsx se carga con import dinámico para no pagar su peso en el
 * bundle de quien nunca importa.
 */
export function ImportarFicha({ valorUF, onImport }: Props) {
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState("");

  async function leer(files: FileList) {
    const file = files[0];
    if (!file) return;
    setLeyendo(true);
    setError("");
    try {
      const XLSX = await import("xlsx");
      const libro = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const nombreHoja =
        libro.SheetNames.find((n) => n.trim().toUpperCase() === HOJA_EESS) ?? libro.SheetNames[0];
      const hoja = libro.Sheets[nombreHoja];
      if (!hoja) throw new ArchivoNoEsEESSError();
      onImport(importarEESS(lectorDeHoja(hoja), { valorUF }));
    } catch (e) {
      console.error("No se pudo importar la ficha EESS", e);
      setError(
        e instanceof ArchivoNoEsEESSError
          ? e.message
          : "No se pudo leer el archivo. Verifica que sea el Excel de la ficha EESS.",
      );
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <FileInput
      onFiles={leer}
      accept=".xlsx"
      disabled={leyendo}
      label={leyendo ? "Leyendo la ficha…" : "Arrastra la ficha EESS (Excel) o haz clic para importarla"}
      hint="El archivo se lee en este computador: no se sube ni se guarda."
      error={error || undefined}
    />
  );
}
