export interface PresetsFond {
  logoAutorise: boolean;
  texteAutorise: boolean;
  imageColorFillEnabled?: boolean;
  imageColorFillWalls?: boolean;
  imageColorFillTarget?: string;
  logoPlaceholderCoords: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  texteStylePreset: {
    font: string;
    color: string;
    size: string; // "small" | "normal" | "large"
  };
  // Harmonized API & Mask controls
  logoSize: string;
  logoColorFill: string;
  logoColorFillEnabled: boolean;
  logoExtra: string;
  textperspective: string;
  textExtra: string;
  // Dynamic Gemini Prompts Toggles
  logoPrompt: string;
  logoPromptActive: boolean;
  textPrompt: string;
  textPromptActive: boolean;
  // Optional dynamic prompts associated with backgrounds or prompt-ai maps
  descImageA?: string;
  descImageB?: string;
  descImageC?: string;
  generalPrompt?: string;
  unifiedInstruction?: string;
  aPrompt?: string;
  bPrompt?: string;
  cPrompt?: string;
}

export interface TransformVehicule {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface BoundingBoxVehicule {
  left: number;     /* Coordonnée X de gauche utile du véhicule dans l'image B d'origine */
  right: number;    /* Coordonnée X de droite utile du véhicule dans l'image B d'origine */
  top: number;      /* Coordonnée Y du haut utile du véhicule dans l'image B d'origine */
  bottom: number;   /* Coordonnée Y du bas utile du véhicule dans l'image B d'origine */
}

export interface MetadataUtilisateur {
  texte: string;
  transformVehicule: TransformVehicule;
  boundingBoxVehicule?: BoundingBoxVehicule;
}

export interface FirestoreJobPayload {
  imageA: string;
  presetsFond: PresetsFond;
  imageB: string;
  imageC: string;
  logo: string;
  metadataUtilisateur: MetadataUtilisateur;
  // Flat API Keys support at root for API Harmonization
  logoX?: string;
  logoY?: string;
  logoSize?: string;
  logoColorFill?: string;
  logoColorFillEnabled?: boolean;
  logoExtra?: string;
  text?: boolean;
  textContent?: string;
  textFont?: string;
  textSize?: string;
  textAlign?: string;
  textColorFill?: string;
  textperspective?: string;
  textExtra?: string;
  textX?: string;
  textY?: string;
  logoPrompt?: string;
  logoPromptActive?: boolean;
  textPrompt?: string;
  textPromptActive?: boolean;
}

export interface BackgroundPreset {
  id: string;
  name: string;
  url: string;
  presetsFond: PresetsFond;
}

export interface VehiclePreset {
  id: string;
  name: string;
  url: string;
}

export interface LogoPreset {
  id: string;
  name: string;
  url: string;
}
