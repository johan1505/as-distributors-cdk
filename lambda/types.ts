export type QuoteItem = { productName: string; quantity: number };

export interface QuoteRequestPayload {
	contactInfo: {
		name: string;
		email: string;
		phone: string;
	};
	quoteItems: QuoteItem[];
	metadata: {
		totalItems: number;
		totalUniqueProducts: number;
		submittedAt: string;
	};
	agreedToContact: boolean;
}
