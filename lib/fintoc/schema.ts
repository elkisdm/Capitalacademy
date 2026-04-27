import { z } from "zod";
import { cleanRut, isValidRut } from "@/lib/utils/rut";

export const checkoutFormSchema = z.object({
  firstname: z.string().trim().min(2, "Nombre muy corto").max(80),
  lastname: z.string().trim().min(2, "Apellido muy corto").max(80),
  rut: z
    .string()
    .trim()
    .refine(isValidRut, "RUT inválido")
    .transform((v) => cleanRut(v)),
  email: z.string().trim().toLowerCase().email("Email inválido").max(160),
  phone: z
    .string()
    .trim()
    .min(8, "Teléfono muy corto")
    .max(20)
    .regex(/^[+\d\s()-]+$/, "Solo números, espacios, +, ( y -"),
});

export type CheckoutFormInput = z.infer<typeof checkoutFormSchema>;
