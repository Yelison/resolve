package com.resolve.api.tickets;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Gancho de test que {@link TicketService#update} ejecuta después de comprobar la versión. Desarmado no hace nada;
 * armado, aparca al primer hilo que llega hasta {@link #release()}, con la transacción (y, si existe, el bloqueo
 * de fila) abierta. Es {@code @Component} y no {@code @TestComponent} para que lo vea el escaneo de la aplicación.
 */
@Component
@Profile("test")
class TicketUpdateBarrier implements TicketUpdateHook {

	private static final long PARK_SECONDS = 15;

	private final AtomicBoolean armed = new AtomicBoolean();

	private volatile CountDownLatch reached = new CountDownLatch(1);

	private volatile CountDownLatch released = new CountDownLatch(1);

	/** El siguiente hilo que ejecute {@code update} queda aparcado; los demás pasan. */
	void arm() {
		this.reached = new CountDownLatch(1);
		this.released = new CountDownLatch(1);
		this.armed.set(true);
	}

	/** Desarma y libera a quien esté aparcado. Seguro de llamar siempre, también en {@code finally}. */
	void disarm() {
		this.armed.set(false);
		this.released.countDown();
	}

	boolean awaitReached(long seconds) throws InterruptedException {
		return this.reached.await(seconds, TimeUnit.SECONDS);
	}

	void release() {
		this.released.countDown();
	}

	@Override
	public void afterVersionCheck() {
		if (!this.armed.compareAndSet(true, false)) {
			return;
		}
		this.reached.countDown();
		try {
			// El tope evita una espera infinita (y un bloqueo en cascada del TRUNCATE) si el test falla antes de soltar.
			if (!this.released.await(PARK_SECONDS, TimeUnit.SECONDS)) {
				throw new IllegalStateException("TicketUpdateBarrier no se liberó en " + PARK_SECONDS + " s");
			}
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(ex);
		}
	}

}
