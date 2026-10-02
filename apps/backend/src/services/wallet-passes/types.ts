export interface PassTicket {
  bookingId: string;
  eventId?: string;
  qrCode: string;
  eventTitle: string;
  startDate: Date;
  venue: string;
  city?: string;
  attendeeName?: string;
  ticketCount: number;
  coverImage?: string;
}
