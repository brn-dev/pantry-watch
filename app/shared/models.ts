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

export type ShoppingListItem = {
  id: string;
  name: string;
  amount: string;
  shop: string;
  done: boolean;
};

export type Household = {
  id: string;
  name: string;
  locations: PantryLocation[];
  shoppingList: ShoppingListItem[];
};
