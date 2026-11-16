plugins {
    id("com.android.application")
}

// Pass with: ./gradlew assembleDebug -PfamilyUrl=https://family.example.com
val familyUrl = (findProperty("familyUrl") as String?)?.trimEnd('/') ?: "https://example.invalid"

android {
    namespace = "com.jamesstewart.family"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.jamesstewart.family"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1-spike"
        buildConfigField("String", "FAMILY_URL", "\"$familyUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
