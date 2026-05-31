plugins {
    java
    id("com.gradleup.shadow") version "9.4.2"
}

group = "dev.clancapes"
version = "1.0.10"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/") { name = "papermc" }
    maven("https://repo.extendedclip.com/content/repositories/placeholderapi/") { name = "placeholderapi" }
}

dependencies {
    // Paper 26.1.2 — Apex server is on build.66-stable (verified via FTP listing
    // 2026-05-28). Track latest stable here; we don't bump for every nightly.
    compileOnly("io.papermc.paper:paper-api:26.1.2.build.66-stable")
    compileOnly("me.clip:placeholderapi:2.12.2")
    // Gson is bundled inside Paper — compileOnly so we don't shade it.
    compileOnly("com.google.code.gson:gson:2.11.0")
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(25)
}

tasks.processResources {
    val props = mapOf("version" to project.version)
    inputs.properties(props)
    filesMatching("plugin.yml") {
        expand(props)
    }
}

tasks.shadowJar {
    archiveClassifier.set("")
    minimize()
}

tasks.build {
    dependsOn(tasks.shadowJar)
}
