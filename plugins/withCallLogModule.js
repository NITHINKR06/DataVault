const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const PACKAGE_NAME = 'com.datavault.app';
const PACKAGE_PATH = PACKAGE_NAME.replace(/\./g, '/');

const JAVA_SOURCE = `package ${PACKAGE_NAME};

import android.content.ContentResolver;
import android.database.Cursor;
import android.provider.CallLog;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

public class DataVaultCallLogModule extends ReactContextBaseJavaModule {

    DataVaultCallLogModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "DataVaultCallLogModule";
    }

    @ReactMethod
    public void getCallLogs(int limit, Promise promise) {
        try {
            ContentResolver cr = getReactApplicationContext().getContentResolver();
            String[] projection = {
                CallLog.Calls.NUMBER,
                CallLog.Calls.CACHED_NAME,
                CallLog.Calls.DATE,
                CallLog.Calls.DURATION,
                CallLog.Calls.TYPE
            };
            Cursor cursor = cr.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null, null,
                CallLog.Calls.DATE + " DESC LIMIT " + limit
            );

            WritableArray result = Arguments.createArray();
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    WritableMap entry = Arguments.createMap();
                    entry.putString("number",   cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER)));
                    entry.putString("name",     cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)));
                    entry.putString("date",     String.valueOf(cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE))));
                    entry.putString("duration", String.valueOf(cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION))));
                    entry.putString("type",     String.valueOf(cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE))));
                    result.pushMap(entry);
                }
                cursor.close();
            }
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("CALL_LOG_ERROR", e.getMessage(), e);
        }
    }
}
`;

const PACKAGE_SOURCE = `package ${PACKAGE_NAME};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public class DataVaultCallLogPackage implements ReactPackage {

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return Arrays.<NativeModule>asList(new DataVaultCallLogModule(reactContext));
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`;

const withCallLogModule = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const androidSrcDir = path.join(
                config.modRequest.platformProjectRoot,
                'app', 'src', 'main', 'java',
                ...PACKAGE_PATH.split('/')
            );

            const modulePath = path.join(androidSrcDir, 'DataVaultCallLogModule.java');
            if (!fs.existsSync(modulePath)) {
                fs.writeFileSync(modulePath, JAVA_SOURCE, 'utf8');
            }

            const packagePath = path.join(androidSrcDir, 'DataVaultCallLogPackage.java');
            if (!fs.existsSync(packagePath)) {
                fs.writeFileSync(packagePath, PACKAGE_SOURCE, 'utf8');
            }

            const mainAppKtPath = path.join(androidSrcDir, 'MainApplication.kt');
            const mainAppPath = path.join(androidSrcDir, 'MainApplication.java');

            if (fs.existsSync(mainAppKtPath)) {
                let kt = fs.readFileSync(mainAppKtPath, 'utf8');
                if (!kt.includes('DataVaultCallLogPackage')) {
                    kt = kt.replace(
                        /override fun getPackages\(\): List<ReactPackage> \{/,
                        `override fun getPackages(): List<ReactPackage> {\n      packages.add(DataVaultCallLogPackage())`
                    );
                    fs.writeFileSync(mainAppKtPath, kt, 'utf8');
                }
            } else if (fs.existsSync(mainAppPath)) {
                let java = fs.readFileSync(mainAppPath, 'utf8');
                if (!java.includes('DataVaultCallLogPackage')) {
                    java = java.replace(
                        /List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);/,
                        `List<ReactPackage> packages = new PackageList(this).getPackages();\n      packages.add(new DataVaultCallLogPackage());`
                    );
                    fs.writeFileSync(mainAppPath, java, 'utf8');
                }
            }

            return config;
        },
    ]);
};

module.exports = withCallLogModule;