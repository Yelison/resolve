package com.resolve.api.knowledge;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Gancho de test que {@link ArticleService#create} ejecuta tras elegir el slug y antes de guardar. Desarmado no hace
 * nada; armado, aparca al primer hilo que llega hasta {@link #release()}, con la transacción y el bloqueo de las
 * altas de la organización tomados. Es {@code @Component} y no {@code @TestComponent} para que lo vea el escaneo de
 * la aplicación.
 */
@Component
@Profile("test")
class ArticleSlugBarrier implements ArticleSlugHook {

	private static final long PARK_SECONDS = 30;

	private final AtomicBoolean armed = new AtomicBoolean();

	private volatile CountDownLatch reached = new CountDownLatch(1);

	private volatile CountDownLatch released = new CountDownLatch(1);

	/** La siguiente alta que elija su slug queda aparcada; las demás pasan. */
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
	public void afterSlugChosen() {
		if (!this.armed.compareAndSet(true, false)) {
			return;
		}
		this.reached.countDown();
		try {
			if (!this.released.await(PARK_SECONDS, TimeUnit.SECONDS)) {
				throw new IllegalStateException("ArticleSlugBarrier no se liberó en " + PARK_SECONDS + " s");
			}
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(ex);
		}
	}

}
