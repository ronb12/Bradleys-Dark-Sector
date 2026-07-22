plugins {
    id("com.android.application")
}

android {
    namespace = "com.bradleys.darksector"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.bradleys.darksector"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}
