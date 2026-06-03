package dev.crestoria.events;

/**
 * Minimal contract the {@link EventScheduler} needs to hold whichever
 * event variant is currently in flight (airdrop, koth, …) without
 * caring which concrete type it is. Each event self-drives on its own
 * tick; the scheduler only needs to know when it's done so it can free
 * the single active-event slot.
 */
public interface RunningEvent {
    boolean isFinished();

    /**
     * Force-stop the event (operator-initiated abort via /clancape
     * event stop). Implementations must idempotently tear down the
     * tick task, barrier, scoreboard, and listener registration and
     * flip {@link #isFinished()} to true so the scheduler reaps it
     * on the next tick.
     */
    void cancel();

    /** Human-readable type ("airdrop" / "koth") for /clancape event status. */
    String type();

    /** Current stage label for /clancape event status. */
    String stageLabel();
}
