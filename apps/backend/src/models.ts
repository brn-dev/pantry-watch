
export type PantryItem = {
    id: string;
    name: string;
    dueDate: Date;
    quantity: number;
    unit?: string;
};

export type Location = {
    id: string;
    name: string;
    items: PantryItem[];
};

export type Household = {
    id: string;
    name: string;
    inviteCode: string;
    locations: Location[];
};