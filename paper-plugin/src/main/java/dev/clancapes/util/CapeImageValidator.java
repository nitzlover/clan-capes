package dev.clancapes.util;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class CapeImageValidator {
    private static final int[][] ALLOWED = {{64, 32}, {128, 64}};

    private CapeImageValidator() {
    }

    public static void validate(Path file, int maxSizeKb) throws IOException {
        long bytes = Files.size(file);
        if (bytes > maxSizeKb * 1024L) {
            throw new IOException("File exceeds max size (" + maxSizeKb + " KB)");
        }

        String name = file.getFileName().toString().toLowerCase();
        if (!name.endsWith(".png")) {
            throw new IOException("Only PNG capes are allowed");
        }

        byte[] header = Files.readAllBytes(file);
        if (header.length < 8 || header[0] != (byte) 0x89 || header[1] != 0x50) {
            throw new IOException("Invalid PNG file");
        }

        BufferedImage image = ImageIO.read(file.toFile());
        if (image == null) {
            throw new IOException("Could not decode PNG");
        }

        boolean valid = false;
        for (int[] size : ALLOWED) {
            if (image.getWidth() == size[0] && image.getHeight() == size[1]) {
                valid = true;
                break;
            }
        }
        if (!valid) {
            throw new IOException("Cape must be 64x32 or 128x64 pixels");
        }
    }
}
