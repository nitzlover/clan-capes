/*
 * Fabric client mod build.
 *
 * MC 26.1 is the first version Mojang ships unobfuscated — the
 * `client.jar` already contains the real class / method / field names
 * the mod source compiles against, so the old Yarn / Intermediary
 * remap pipeline is gone:
 *
 *   - No `mappings(...)` line in dependencies (officialMojangMappings()
 *     blew up on 26.1.2 because `client_mappings` was dropped from the
 *     Mojang launcher manifest).
 *   - `modImplementation` / `modCompileOnly` collapse back to plain
 *     `implementation` / `compileOnly` since there's nothing to remap.
 *   - `remapJar` collapses to `jar` — the build output goes straight
 *     into `build/libs/<archivesName>-<version>.jar` without a remap
 *     step.
 *
 * Loom plugin: `net.fabricmc.fabric-loom` (the new ID — the legacy
 * `fabric-loom-remap` plugin no longer applies to 26.1+ projects).
 * 1.16-SNAPSHOT is the line Fabric tagged for the 26.1 retarget; the
 * 1.17.0-alpha track exists in parallel for intermediary work the
 * project no longer ships, so we deliberately stay off it.
 */

plugins {
    id("net.fabricmc.fabric-loom") version "1.16-SNAPSHOT"
    java
}

val minecraftVersion: String by project
val loaderVersion: String by project
val fabricApiVersion: String by project
val modVersion: String by project
val mavenGroup: String by project
val archivesBaseName: String by project

base.archivesName.set(archivesBaseName)
version = modVersion
group = mavenGroup

repositories {
    mavenCentral()
    maven("https://maven.fabricmc.net/") { name = "Fabric" }
}

loom {
    // Client-only mod — split source sets keep server-only API
    // references from sneaking into the client jar via auto-complete.
    // The `client` source set holds everything the player runs; the
    // empty `main` set is kept around so loom's mod-id registration
    // can name both halves without "missing source set" warnings on
    // future server-side additions.
    splitEnvironmentSourceSets()

    mods {
        register("clancapes") {
            sourceSet(sourceSets["main"])
            sourceSet(sourceSets["client"])
        }
    }
}

dependencies {
    minecraft("com.mojang:minecraft:$minecraftVersion")
    implementation("net.fabricmc:fabric-loader:$loaderVersion")
    implementation("net.fabricmc.fabric-api:fabric-api:$fabricApiVersion")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
    withSourcesJar()
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(25)
}

tasks.processResources {
    val props = mapOf(
        "version" to project.version,
        "loader_version" to loaderVersion,
        "minecraft_version" to minecraftVersion
    )
    inputs.properties(props)
    filesMatching("fabric.mod.json") {
        expand(props)
    }
}
