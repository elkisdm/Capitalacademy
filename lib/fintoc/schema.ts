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
  plan: z.enum(["contado", "webpay-6", "webpay-12"]).default("contado"),
});

// Input: lo que envía el formulario antes de aplicar defaults (plan es opcional).
// Output: lo que entrega zod tras parsear (plan ya tiene valor).
export type CheckoutFormInput = z.input<typeof checkoutFormSchema>;
export type CheckoutFormData = z.output<typeof checkoutFormSchema>;
