plugins { kotlin("jvm") }

dependencies {
    // org.json is built into Android, so the app must not bundle a second copy: compile against
    // it here and add it only for the JVM tests.
    compileOnly("org.json:json:20240303")
    testImplementation("org.json:json:20240303")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
    // Same JSON files the desktop app uses: researched data and mock consoles (test vectors).
    systemProperty("vantaflow.shared", rootProject.file("../shared").absolutePath)
}
