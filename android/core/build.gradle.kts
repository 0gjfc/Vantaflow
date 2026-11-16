plugins { kotlin("jvm") version "2.0.21" }

repositories { mavenCentral() }

dependencies {
    // org.json is built into Android; on the JVM it comes from Maven Central.
    implementation("org.json:json:20240303")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
    // Same JSON files the desktop app uses: researched data and mock consoles (test vectors).
    systemProperty("vantaflow.shared", rootProject.file("../shared").absolutePath)
}
