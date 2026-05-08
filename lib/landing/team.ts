export type Instructor = {
  id: string;
  name: string;
  role: string;
  bio: string;
  expertise: string[];
  image: { src: string; alt: string };
};

export const INSTRUCTORS: Instructor[] = [
  {
    id: "paola-vicuna",
    name: "Paola Vicuña",
    role: "Directora Académica · Capital Academy",
    bio: "Lidera el diseño curricular y la dirección académica de Capital Academy. Conecta la formación con los desafíos reales del negocio inmobiliario y vela por que cada programa entregue criterio, dominio técnico y resultados medibles.",
    expertise: [
      "Dirección académica",
      "Diseño curricular",
      "Formación ejecutiva",
      "Industria inmobiliaria",
    ],
    image: {
      src: "/team/paola-vicuna.webp",
      alt: "Paola Vicuña, Directora Académica de Capital Academy",
    },
  },
];
