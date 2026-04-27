export const SALES_REP_OPTIONS = ["Judith", "Sanjay", "Ajay", "New customer"] as const;

export type SalesRepOption = (typeof SALES_REP_OPTIONS)[number];

export type QuoteItem = {
	productName: string;
	itemNumber: string;
	quantity: number;
	variantLabel?: string;
	variantValue?: string;
};

export interface QuoteRequestPayload {
	contactInfo: {
		name: string;
		companyName: string;
		email: string;
		phone: string;
		zipCode: string;
		salesRep: SalesRepOption;
	};
	quoteItems: QuoteItem[];
	metadata: {
		totalItems: number;
		totalUniqueProducts: number;
		submittedAt: string;
	};
	agreedToContact: boolean;
}
