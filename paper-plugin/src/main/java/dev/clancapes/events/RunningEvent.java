package dev.clancapes.events;

/**
 * Minimal contract the {@link EventScheduler} needs to hold whichever
 * event variant is currently in flight (airdrop, koth, …) without
 * caring which concrete type it is. Each event self-drives on its own
 * tick; the scheduler only needs to know when it's done so it can free
 * the single active-event slot.
 */
public interface RunningEvent {
    boolean isFinished();
}
