export function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    mercadoPagoConnected: Boolean(user.mpAccessToken),
    isVerified: user.isVerified,
  };
}

export function toPublicEvent(event) {
  return {
    id: event._id.toString(),
    organizerId: event.organizer.toString(),
    organizerName: event.organizerName,
    title: event.title,
    description: event.description,
    category: event.category,
    date: event.date,
    time: event.time,
    location: event.location,
    city: event.city ?? '',
    imageUrl: event.imageUrl,
    status: event.status,
    ticketTypes: event.ticketTypes.map((tt) => ({
      id: tt._id.toString(),
      name: tt.name,
      price: tt.price,
      quantityAvailable: tt.quantityAvailable,
      quantitySold: tt.quantitySold,
    })),
  };
}

export function toPublicTicket(ticket) {
  return {
    id: ticket._id.toString(),
    eventId: ticket.event.toString(),
    ticketTypeId: ticket.ticketTypeId.toString(),
    buyerId: ticket.buyer.toString(),
    eventTitle: ticket.eventTitle,
    ticketTypeName: ticket.ticketTypeName,
    quantity: ticket.quantity,
    totalPaid: ticket.totalPaid,
    purchasedAt: ticket.createdAt,
    code: ticket.code,
    checkedInAt: ticket.checkedInAt ?? null,
    status: ticket.status,
    groupId: ticket.groupId ? ticket.groupId.toString() : null,
    groupCode: ticket.groupCode ?? null,
    groupName: ticket.groupName ?? null,
    groupSeatIndex: ticket.groupSeatIndex ?? null,
    attendeeName: ticket.attendeeName ?? null,
    attendeeEmail: ticket.attendeeEmail ?? null,
    attendeeUserId: ticket.attendeeUser ? ticket.attendeeUser.toString() : null,
  };
}
