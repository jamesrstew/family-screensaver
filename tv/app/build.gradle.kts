plugins {
    id("com.android.application")
}

// Pass with: ./gradlew assembleDebug -PheritageUrl=https://heritage.example.com
val heritageUrl = (findProperty("heritageUrl") as String?)?.trimEnd('/') ?: "https://example.invalid"

android {
    namespace = "com.jamesstewart.heritage"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.jamesstewart.heritage"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1-spike"
        buildConfigField("String", "HERITAGE_URL", "\"$heritageUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
