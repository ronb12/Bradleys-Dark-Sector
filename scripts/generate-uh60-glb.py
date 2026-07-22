"""Build a game-ready UH-60-style Black Hawk GLB with a readable cabin interior."""

from __future__ import annotations

import math
import os
import sys

import bpy

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public",
    "models",
    "uh60-extract.glb",
)


def mat(name, color, metal=0.55, rough=0.4, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emission is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


def add_cube(name, size, material, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = size
    obj.data.materials.append(material)
    return obj


def add_cylinder(name, radius, depth, verts, material, loc, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, vertices=verts, location=loc, rotation=rot
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def add_uv_sphere(name, radius, segments, rings, material, loc, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=radius, segments=segments, ring_count=rings, location=loc
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    return obj


def add_capsule(name, radius, depth, material, loc, rot=(0, 0, 0), scale=(1, 1, 1)):
    """Approximate capsule with a scaled UV sphere + cylinder stack if needed — use elongated sphere."""
    return add_uv_sphere(name, radius, 16, 12, material, loc, scale=(scale[0], scale[1] * (depth / (radius * 2)), scale[2]))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # Blender Z-up; glTF export_yup maps Z→Y. Forward is +Y in Blender.
    olive = mat("Olive", (0.22, 0.28, 0.2), 0.62, 0.38)
    panel = mat("Panel", (0.16, 0.2, 0.15), 0.55, 0.45)
    dark = mat("Dark", (0.06, 0.08, 0.06), 0.48, 0.5)
    glass = mat("Glass", (0.28, 0.45, 0.52), 0.12, 0.1, (0.08, 0.14, 0.2), 0.35)
    rotor = mat("Rotor", (0.05, 0.06, 0.05), 0.3, 0.65)
    accent = mat("Accent", (0.62, 0.5, 0.18), 0.4, 0.42, (0.35, 0.22, 0.05), 0.25)
    black = mat("Black", (0.02, 0.02, 0.02), 0.2, 0.85)
    seat = mat("Seat", (0.14, 0.18, 0.12), 0.12, 0.88)
    seat_pad = mat("SeatPad", (0.28, 0.34, 0.2), 0.08, 0.9)
    dash = mat("Dash", (0.05, 0.06, 0.05), 0.55, 0.35)
    glow = mat("Glow", (0.25, 0.75, 0.55), 0.1, 0.4, (0.1, 0.45, 0.3), 1.2)
    amber = mat("Amber", (0.75, 0.55, 0.1), 0.2, 0.45, (0.4, 0.25, 0.05), 0.7)
    fabric = mat("Fabric", (0.35, 0.28, 0.18), 0.05, 0.92)
    dome = mat("Dome", (1.0, 0.88, 0.55), 0.1, 0.35, (1.0, 0.75, 0.35), 1.5)
    exhaust = mat("Exhaust", (0.22, 0.18, 0.14), 0.72, 0.32)

    root = bpy.data.objects.new("UH60_Extract", None)
    scene.collection.objects.link(root)

    # Capsule-like main hull (elongated sphere)
    add_uv_sphere("Hull", 1.05, 18, 14, olive, (0, 0.15, 1.55), (1.15, 2.35, 0.92))
    add_uv_sphere("Spine", 0.55, 14, 10, panel, (0, 0.05, 2.35), (1.05, 2.0, 0.7))
    add_uv_sphere("Nose", 0.95, 16, 12, olive, (0, 2.85, 1.55), (1.05, 1.35, 0.85))
    add_uv_sphere("Chin", 0.55, 12, 10, dark, (0, 3.15, 0.95), (1.2, 1.1, 0.55))

    add_cube("Windshield", (1.55, 0.06, 0.95), glass, (0, 3.45, 1.95), (math.radians(-20), 0, 0))
    add_cube("SideGlassL", (0.05, 1.15, 0.75), glass, (-0.88, 2.65, 1.85), (0, 0, math.radians(-7)))
    add_cube("SideGlassR", (0.05, 1.15, 0.75), glass, (0.88, 2.65, 1.85), (0, 0, math.radians(7)))

    for side, x in (("L", -0.78), ("R", 0.78)):
        add_uv_sphere(f"Engine{side}", 0.38, 14, 10, dark, (x, 0.05, 2.55), (0.75, 1.7, 0.65))
        add_cylinder(f"Intake{side}", 0.3, 0.22, 12, exhaust, (x, 1.0, 2.55), (math.radians(90), 0, 0))
        add_cylinder(f"Exhaust{side}", 0.24, 0.55, 10, exhaust, (x, -0.95, 2.62), (math.radians(90), 0, 0))

    # ESSS stub wings
    add_cube("StubL", (1.15, 0.55, 0.1), panel, (-0.85, 0.15, 1.35), (0, 0, math.radians(5)))
    add_cube("StubR", (1.15, 0.55, 0.1), panel, (0.85, 0.15, 1.35), (0, 0, math.radians(-5)))
    add_cube("PylonL", (0.12, 0.18, 0.55), dark, (-0.95, 0.15, 1.05))
    add_cube("PylonR", (0.12, 0.18, 0.55), dark, (0.95, 0.15, 1.05))

    add_cube("DoorL", (0.07, 1.65, 1.35), accent, (-1.12, 0.15, 1.45))
    add_cube("DoorR", (0.07, 1.05, 1.35), accent, (1.12, -0.45, 1.45))
    add_cube("DoorOpen", (0.07, 0.55, 1.35), panel, (1.12, 0.95, 1.45))
    add_cube("SillL", (0.14, 3.6, 0.18), dark, (-1.08, 0.1, 0.82))
    add_cube("SillR", (0.14, 3.6, 0.18), dark, (1.08, 0.1, 0.82))

    add_cylinder("Boom", 0.28, 5.4, 12, dark, (0, -4.55, 1.95), (math.radians(90), 0, 0), (0.55, 0.55, 1))
    add_cube("BoomFairing", (0.7, 1.9, 0.55), panel, (0, -2.55, 2.05))
    add_cube("Fin", (0.1, 1.45, 2.05), dark, (0, -6.75, 2.85))
    add_cube("StabL", (1.75, 0.75, 0.09), dark, (-1.05, -6.35, 2.15), (0, 0, math.radians(8)))
    add_cube("StabR", (1.75, 0.75, 0.09), dark, (1.05, -6.35, 2.15), (0, 0, math.radians(-8)))

    for side, x in (("L", -0.95), ("R", 0.95)):
        add_cylinder(f"Strut{side}", 0.06, 0.95, 8, dark, (x, 0.35, 0.85))
        add_cylinder(f"Wheel{side}", 0.28, 0.18, 14, black, (x, 0.35, 0.32), (0, math.radians(90), 0))
    add_cylinder("NoseStrut", 0.05, 0.7, 8, dark, (0, 2.55, 0.8))
    add_cylinder("NoseWheel", 0.18, 0.12, 12, black, (0, 2.55, 0.38), (0, math.radians(90), 0))

    add_cylinder("Hub", 0.36, 0.42, 14, dark, (0, 0.1, 3.05))
    blade_len = 8.2
    blade_w = 0.38
    for i in range(4):
        ang = i * (math.pi / 2)
        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(math.sin(ang) * blade_len * 0.28, math.cos(ang) * blade_len * 0.28, 3.25),
        )
        blade = bpy.context.active_object
        blade.name = f"Blade{i}"
        blade.dimensions = (blade_w, blade_len, 0.045)
        blade.rotation_euler = (0, 0, ang)
        blade.data.materials.append(rotor)

    add_cylinder("TailRotorHub", 0.12, 0.18, 8, dark, (0.58, -7.05, 2.65), (0, math.radians(90), 0))
    for i in range(4):
        ang = i * (math.pi / 2)
        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(0.68, -7.05 + math.cos(ang) * 0.55, 2.65 + math.sin(ang) * 0.55),
        )
        tb = bpy.context.active_object
        tb.name = f"TailBlade{i}"
        tb.dimensions = (0.08, 0.18, 1.45)
        tb.rotation_euler = (ang, 0, 0)
        tb.data.materials.append(rotor)

    add_uv_sphere("NavRed", 0.07, 10, 8, mat("NavRed", (1, 0.1, 0.1), 0.2, 0.4, (0.8, 0, 0), 1.2), (-1.25, 0.9, 1.55))
    add_uv_sphere("NavGreen", 0.07, 10, 8, mat("NavGreen", (0.1, 1, 0.35), 0.2, 0.4, (0, 0.6, 0.2), 1.2), (1.25, 0.9, 1.55))

    # --- Cabin interior ---
    add_cube("CabinFloor", (2.05, 3.6, 0.08), dark, (0, 0.15, 0.72))
    add_cube("CabinCeiling", (2.0, 3.4, 0.06), olive, (0, 0.1, 2.35))
    add_cube("Bulkhead", (2.05, 0.08, 1.55), olive, (0, 2.05, 1.5))
    add_cube("CabinWindshield", (1.7, 0.04, 0.95), glass, (0, 2.02, 1.85))
    add_cube("Dash", (1.55, 0.55, 0.35), dash, (0, 1.65, 1.15))
    for i in range(4):
        add_cube(f"Screen{i}", (0.28, 0.02, 0.18), glow if i % 2 == 0 else amber, (-0.5 + i * 0.35, 1.4, 1.28))

    def seat_at(name, x, y):
        add_cube(f"{name}Base", (0.48, 0.48, 0.12), seat, (x, y, 0.9))
        add_cube(f"{name}Back", (0.48, 0.1, 0.55), seat_pad, (x, y - 0.2, 1.2))
        add_cube(f"{name}Pad", (0.44, 0.42, 0.08), seat_pad, (x, y, 0.98))

    seat_at("PilotL", -0.42, 1.15)
    seat_at("PilotR", 0.42, 1.15)
    seat_at("TroopL0", -0.72, 0.15)
    seat_at("TroopL1", -0.72, -0.65)
    seat_at("TroopR0", 0.72, 0.15)
    seat_at("TroopR1", 0.72, -0.65)
    add_cube("TroopBench", (1.8, 0.45, 0.35), fabric, (0, -1.35, 0.95))
    add_cube("TroopBack", (1.8, 0.08, 0.55), seat, (0, -1.55, 1.25))
    add_cylinder("GrabRail", 0.025, 2.8, 8, dark, (0, 0.1, 2.15), (0, 0, math.radians(90)))
    add_uv_sphere("CabinDome", 0.12, 12, 8, dome, (0, 0.2, 2.22))
    add_cube("DoorChevronL", (0.08, 1.1, 0.06), amber, (-1.02, 0.25, 0.78))
    add_cube("DoorChevronR", (0.08, 1.1, 0.06), amber, (1.02, 0.25, 0.78))

    for obj in list(scene.objects):
        if obj != root and obj.parent is None and obj.type == "MESH":
            obj.parent = root

    for obj in scene.objects:
        if obj.type == "MESH":
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.shade_smooth()

    for obj in list(scene.objects):
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.select_set(False)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
    )
    print(f"Exported {OUT} ({os.path.getsize(OUT)} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
