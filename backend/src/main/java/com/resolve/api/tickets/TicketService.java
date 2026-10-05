package com.resolve.api.tickets;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.PreconditionFailedException;
import com.resolve.api.common.error.ResourceNotFoundException;
import com.resolve.api.common.persistence.Ids;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.Preconditions;
import com.resolve.api.customers.Customer;
import com.resolve.api.customers.CustomerRepository;
import com.resolve.api.memberships.AssignedTicketReleaser;
import com.resolve.api.memberships.Membership;
import com.resolve.api.memberships.MembershipRepository;
import com.resolve.api.memberships.UserAccount;
import com.resolve.api.memberships.UserAccountRepository;
import com.resolve.api.tickets.TicketDtos.ActivityDto;
import com.resolve.api.tickets.TicketDtos.MessageAuthorDto;
import com.resolve.api.tickets.TicketDtos.MessageDto;
import com.resolve.api.tickets.TicketDtos.TicketDto;
import com.resolve.api.tickets.TicketDtos.TicketSummaryDto;
import com.resolve.api.tickets.TicketRequestParser.NewMessage;
import com.resolve.api.tickets.TicketRequestParser.NewTicket;
import com.resolve.api.tickets.TicketRequestParser.TicketChanges;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Casos de uso de tickets. Toda lectura y escritura parte del {@link CurrentMember}: su organización y, si es un
 * cliente, su registro de cliente. Cada cambio y su entrada de historial se guardan en la misma transacción.
 */
@Service
class TicketService implements AssignedTicketReleaser {

	private static final String UNKNOWN_CUSTOMER = "Selecciona un cliente de tu organización.";

	private static final String UNKNOWN_ASSIGNEE = "Selecciona un administrador o agente de tu organización.";

	private final TicketRepository tickets;

	private final TicketMessageRepository messages;

	private final TicketActivityRepository activities;

	private final CustomerRepository customers;

	private final MembershipRepository memberships;

	private final UserAccountRepository users;

	private final TicketMetricsQuery metrics;

	private final Clock clock;

	private final ObjectProvider<TicketUpdateHook> updateHook;

	TicketService(TicketRepository tickets, TicketMessageRepository messages, TicketActivityRepository activities,
			CustomerRepository customers, MembershipRepository memberships, UserAccountRepository users,
			TicketMetricsQuery metrics, Clock clock,
			ObjectProvider<TicketUpdateHook> updateHook) {
		this.tickets = tickets;
		this.messages = messages;
		this.activities = activities;
		this.customers = customers;
		this.memberships = memberships;
		this.users = users;
		this.metrics = metrics;
		this.clock = clock;
		this.updateHook = updateHook;
	}

	@Transactional(readOnly = true)
	PageResponse<TicketSummaryDto> list(CurrentMember member, TicketFilters filters, PageQuery<TicketSortField> page) {
		return this.tickets.search(TicketScope.of(member), filters, page).map(TicketSummaryDto::from);
	}

	@Transactional(readOnly = true)
	TicketMetrics metrics(CurrentMember member) {
		return this.metrics.compute(member);
	}

	@Transactional(readOnly = true)
	TicketDto get(CurrentMember member, long number) {
		return TicketDto.from(find(member, number));
	}

	@Transactional
	TicketDto create(CurrentMember member, NewTicket request) {
		// Un cliente archivado no admite tickets nuevos y se rechaza igual que uno desconocido o de otra organización.
		Customer customer = this.customers.findByOrganizationIdAndId(member.organizationId(), request.customerId())
			.filter((candidate) -> candidate.getArchivedAt() == null)
			.orElseThrow(() -> new ApiValidationException("customerId", UNKNOWN_CUSTOMER));
		UserAccount assignee = (request.assigneeId() != null) ? staffMember(member, request.assigneeId()) : null;
		Instant now = this.clock.instant();
		long number = this.tickets.allocateNumber(member.organizationId());
		Ticket ticket = this.tickets.save(new Ticket(Ids.newId(), member.organizationId(), number, request.subject(),
				request.description(), request.priority(), request.channel(), customer, assignee, now));
		this.activities.save(TicketActivity.created(Ids.newId(), ticket, member, now));
		if (assignee != null) {
			this.activities.save(TicketActivity.assigneeChanged(Ids.newId(), ticket, member, null, assignee, now));
		}
		return TicketDto.from(ticket);
	}

	/**
	 * Aplica un merge-patch. Orden de errores del contrato: 404, 428, 400 y 412 (401 y 403 ya los resolvió la
	 * capa de seguridad). Un patch sin cambios responde 200 sin nueva versión ni historial.
	 */
	@Transactional
	TicketDto update(CurrentMember member, long number, @Nullable String ifMatch,
			Supplier<TicketChanges> body) {
		// La fila queda bloqueada hasta el commit: la versión que se comprueba es la última confirmada y nada puede
		// cambiar updated_at entre esta lectura y el flush, así que el máximo calculado en memoria es el guardado.
		Ticket ticket = find(member, number, true);
		long expectedVersion = Preconditions.requireVersion(ifMatch, "ticket");
		TicketChanges changes = body.get();
		// Un responsable que no cambia no se vuelve a validar ni a bloquear: puede ser alguien retirado de un ticket
		// resuelto. Solo el que entra se comprueba, con su membresía bloqueada hasta el commit.
		UserAccount newAssignee = (changes.assigneeChanged() && changes.assigneeId() != null
				&& !isAssignee(ticket, changes.assigneeId())) ? staffMember(member, changes.assigneeId()) : null;
		if (ticket.getVersion() != expectedVersion) {
			throw new PreconditionFailedException(
					"El ticket cambió desde que lo abriste. Vuelve a cargarlo para ver los cambios.");
		}

		Instant now = this.clock.instant();
		this.updateHook.ifAvailable(TicketUpdateHook::afterVersionCheck);
		if (changes.status() != null) {
			TicketStatus previous = ticket.changeStatus(changes.status(), now);
			if (previous != null) {
				this.activities.save(
						TicketActivity.statusChanged(Ids.newId(), ticket, member, previous, changes.status(), now));
			}
		}
		if (changes.priority() != null) {
			TicketPriority previous = ticket.changePriority(changes.priority(), now);
			if (previous != null) {
				this.activities.save(
						TicketActivity.priorityChanged(Ids.newId(), ticket, member, previous, changes.priority(), now));
			}
		}
		if (changes.assigneeChanged() && !isAssignee(ticket, changes.assigneeId())) {
			UserAccount previous = ticket.getAssignee();
			if (ticket.assign(newAssignee, now)) {
				this.activities.save(TicketActivity.assigneeChanged(Ids.newId(), ticket, member, previous, newAssignee, now));
			}
		}
		// El flush dentro de la transacción hace visible la nueva versión en la respuesta y detecta carreras.
		this.tickets.flush();
		return TicketDto.from(ticket);
	}

	/**
	 * Quita el responsable a los tickets sin resolver de un miembro retirado, con una actividad por ticket. Cada
	 * uno se comporta como un PATCH del administrador: sube la versión y mueve {@code updatedAt} sin retroceder.
	 */
	@Override
	@Transactional(propagation = Propagation.MANDATORY)
	public int releaseOpenTickets(CurrentMember actor, UUID userId, Instant now) {
		List<Ticket> assigned = this.tickets.lockOpenAssignedTo(actor.organizationId(), userId);
		for (Ticket ticket : assigned) {
			UserAccount previous = ticket.getAssignee();
			if (ticket.assign(null, now)) {
				this.activities.save(TicketActivity.assigneeChanged(Ids.newId(), ticket, actor, previous, null, now));
			}
		}
		this.tickets.flush();
		return assigned.size();
	}

	@Transactional(readOnly = true)
	List<MessageDto> messages(CurrentMember member, long number) {
		Ticket ticket = find(member, number);
		List<TicketMessage> conversation = member.isStaff()
				? this.messages.findConversation(member.organizationId(), ticket.getId())
				: this.messages.findPublicConversation(member.organizationId(), ticket.getId());
		return conversation.stream().map(MessageDto::from).toList();
	}

	@Transactional
	MessageDto addMessage(CurrentMember member, long number, NewMessage request) {
		Ticket ticket = find(member, number);
		Instant now = this.clock.instant();
		UserAccount author = this.users.getReferenceById(member.userId());
		TicketMessage message = this.messages
			.save(TicketMessage.byAgent(Ids.newId(), ticket, author, request.visibility(), request.body(), now));
		MessageDto created = new MessageDto(message.getId(), message.getBody(), message.getVisibility(),
				new MessageAuthorDto(member.userId(), member.name(), AuthorKind.AGENT), now);
		if (request.visibility() == MessageVisibility.PUBLIC) {
			// Solo las respuestas públicas cuentan como actividad visible y como primera respuesta.
			this.tickets.touchPublicActivity(ticket.getId(), now, true);
		}
		return created;
	}

	@Transactional(readOnly = true)
	List<ActivityDto> activity(CurrentMember member, long number) {
		Ticket ticket = find(member, number);
		return this.activities.findHistory(member.organizationId(), ticket.getId())
			.stream()
			.map(ActivityDto::from)
			.toList();
	}

	/** Busca el ticket en el alcance del miembro. Un ticket ajeno responde igual que uno inexistente (404). */
	private Ticket find(CurrentMember member, long number) {
		return find(member, number, false);
	}

	private Ticket find(CurrentMember member, long number, boolean forUpdate) {
		Optional<Ticket> ticket;
		if (member.isStaff()) {
			ticket = forUpdate ? this.tickets.lockInOrganization(member.organizationId(), number)
					: this.tickets.findInOrganization(member.organizationId(), number);
		}
		else {
			ticket = forUpdate
					? this.tickets.lockForCustomer(member.organizationId(), member.customerId(), number)
					: this.tickets.findForCustomer(member.organizationId(), member.customerId(), number);
		}
		return ticket.orElseThrow(() -> new ResourceNotFoundException("No existe el ticket #" + number + "."));
	}

	private static boolean isAssignee(Ticket ticket, @Nullable UUID userId) {
		return ticket.getAssignee() != null && ticket.getAssignee().getId().equals(userId);
	}

	/**
	 * Responsable válido: admin o agente activo de la misma organización. Ids ajenos, inexistentes, invitados y
	 * retirados dan el mismo error. La membresía queda bloqueada (compartida) hasta el commit: una retirada no
	 * puede confirmarse entre esta comprobación y la asignación.
	 */
	private UserAccount staffMember(CurrentMember member, UUID userId) {
		return this.memberships.findAssignableStaffMemberShared(member.organizationId(), userId)
			.map(Membership::getUser)
			.orElseThrow(() -> new ApiValidationException("assigneeId", UNKNOWN_ASSIGNEE));
	}

}
