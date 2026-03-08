export type PantryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expirationDate: string | null;
};

export type PantryLocation = {
  id: string;
  name: string;
  items: PantryItem[];
};

export type Household = {
  id: string;
  name: string;
  locations: PantryLocation[];
};
