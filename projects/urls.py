from django.urls import path

from . import views

urlpatterns = [
    path("map/", views.map_page),
    path("kalman/", views.kalman_page),
    path("api/solve/", views.solve_map_pathfinding),
    path("api/kalman/", views.solve_kalman),
    path("api/tiles/<int:z>/<int:x>/<int:y>.<str:ext>", views.tile_proxy, name="tile_proxy")
]
