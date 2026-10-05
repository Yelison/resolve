package com.resolve.api.memberships;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Gancho de test que {@link MemberService} ejecuta tras comprobar la regla del último administrador. Desarmado no
 * hace nada; armado, aparca al primer hilo que llega hasta {@link #release()}, con la transacción y el bloqueo del
 * equipo tomados. Es {@code @Component} y no {@code @TestComponent} para que lo vea el escaneo de la aplicación.
 */
@Component
@Profile("test")
class MemberGuardBarrier implements MemberGuardHook {

	private static final long PARK_SECONDS = 15;

	private final AtomicBoolean armed = new AtomicBoolean();

	private volatile CountDownLatch reached = new CountDownLatch(1);

	private volatile CountDownLatch released = new CountDownLatch(1);

	/** La siguiente operación que pase la comprobación queda aparcada; las demás pasan. */
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
	public void afterGuardCheck() {
		if (!this.armed.compareAndSet(true, false)) {
			return;
		}
		this.reached.countDown();
		try {
			if (!this.released.await(PARK_SECONDS, TimeUnit.SECONDS)) {
				throw new IllegalStateException("MemberGuardBarrier no se liberó en " + PARK_SECONDS + " s");
			}
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(ex);
		}
	}

}
