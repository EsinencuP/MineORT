plugins {
    java
}

group = "org.mineort"
version = "0.1.1"

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(25))
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/") {
        name = "Paper"
    }
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:26.3.build.258-stable")
    testImplementation("io.papermc.paper:paper-api:26.3.build.258-stable")
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("com.google.code.gson:gson:2.13.2")
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}

tasks.processResources {
    inputs.property("version", version)
    filesMatching("plugin.yml") {
        expand("version" to version)
    }
}

tasks.test {
    useJUnitPlatform()
}
