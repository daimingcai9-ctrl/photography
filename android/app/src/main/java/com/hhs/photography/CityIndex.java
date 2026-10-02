package com.hhs.photography;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Bounded, cached offline lookup. Approximate city labels; never invent GPS. */
final class CityIndex {
    private final Context context;
    private JSONArray cities;
    private boolean loaded;
    CityIndex(Context context) { this.context=context; }
    private synchronized void load() {
        if (loaded) return;
        loaded=true;
        try (InputStream input=context.getAssets().open("ui/world-land.geojson"); ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192]; int count;
            while ((count=input.read(buffer))!=-1) {
                if (output.size()+count>1024*1024) return;
                output.write(buffer,0,count);
            }
            cities=new JSONObject(output.toString(StandardCharsets.UTF_8.name())).getJSONObject("china").getJSONArray("cities");
        } catch (Exception ignored) { /* Coordinates remain usable if the optional city index is unavailable. */ }
    }
    String name(double lat,double lng) {
        if (!Double.isFinite(lat)||!Double.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||(lat==0&&lng==0)) return null;
        load(); if (cities==null) return null;
        try {
            for(int i=0;i<cities.length();i++) {
                JSONObject city=cities.getJSONObject(i); JSONArray bounds=city.getJSONArray("bbox");
                if(lng<bounds.getDouble(0)||lat<bounds.getDouble(1)||lng>bounds.getDouble(2)||lat>bounds.getDouble(3)) continue;
                JSONObject geometry=city.getJSONObject("geometry"); JSONArray coordinates=geometry.getJSONArray("coordinates");
                if(geometry.getString("type").equals("Polygon")) {
                    if(polygon(coordinates,lng,lat)) return city.getJSONObject("properties").getString("name");
                } else for(int p=0;p<coordinates.length();p++) if(polygon(coordinates.getJSONArray(p),lng,lat)) return city.getJSONObject("properties").getString("name");
            }
        } catch(Exception ignored) { }
        return null;
    }
    private static boolean polygon(JSONArray rings,double x,double y) throws Exception {
        if(rings.length()==0||!ring(rings.getJSONArray(0),x,y)) return false;
        for(int i=1;i<rings.length();i++) if(ring(rings.getJSONArray(i),x,y)) return false;
        return true;
    }
    private static boolean ring(JSONArray points,double x,double y) throws Exception {
        boolean inside=false;
        for(int i=0,j=points.length()-1;i<points.length();j=i++) {
            JSONArray a=points.getJSONArray(i),b=points.getJSONArray(j);
            double ax=a.getDouble(0),ay=a.getDouble(1),bx=b.getDouble(0),by=b.getDouble(1);
            if((ay>y)!=(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
        }
        return inside;
    }
}
